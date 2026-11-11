"""Export official Maia-3 weights to ONNX with the official model code and
check parity against PyTorch.

Usage: python export.py <CSSLab/maia3 checkout> <maia3-5m|maia3-23m> <checkpoint.pt> <out.onnx>
Reproduced with maia3 at commit 1e13597, Hugging Face UofTCSSLab/Maia3-5M
b6559de2 and Maia3-23M 51a0145a, torch 2.15, onnx 1.23, onnxruntime 1.31.
RMSNorm is written out because opset 17 has no rms_norm operator.
"""
import sys, hashlib, argparse, types, numpy as np, torch, onnxruntime as ort
sys.path.insert(0, sys.argv[1])  # official repo
import torch.nn.functional as F
def _rms(x, normalized_shape, weight=None, eps=None):
    eps = torch.finfo(x.dtype).eps if eps is None else eps  # same default as torch.nn.functional.rms_norm
    y = x * torch.rsqrt(x.pow(2).mean(-1, keepdim=True) + eps)
    return y * weight if weight is not None else y
F.rms_norm = _rms
torch.rms_norm = _rms
from maia3.models import MAIA3Model
from maia3.model_registry import MODEL_SPECS
name, ckpt, out = sys.argv[2], sys.argv[3], sys.argv[4]
spec = next(s for s in MODEL_SPECS if s.name == name)
cfg = types.SimpleNamespace(**spec.config)
model = MAIA3Model(cfg)
sd = torch.load(ckpt, map_location="cpu", weights_only=True)
sd = sd["model_state_dict"] if "model_state_dict" in sd else sd
sd = {k.replace("smolgen", "gab"): v for k, v in sd.items()}
missing, unexpected = model.load_state_dict(sd, strict=False)
print("missing", missing, "unexpected", unexpected)
model.eval()
class Wrap(torch.nn.Module):
    def __init__(s, m): super().__init__(); s.m = m
    def forward(s, tokens, elo_self, elo_oppo):
        lm, lv, _ = s.m(tokens, elo_self, elo_oppo)
        return lm, lv
w = Wrap(model).eval()
B = 4
tok = (torch.rand(B, 64, 12 * cfg.history) < 0.05).float()
es = torch.tensor([1500., 800., 2200., 1200.]); eo = torch.tensor([1500., 1000., 2000., 1900.])
torch.onnx.export(w, (tok, es, eo), out, input_names=["tokens", "elo_self", "elo_oppo"], output_names=["logits_move", "logits_value"],
    dynamic_axes={"tokens": {0: "b"}, "elo_self": {0: "b"}, "elo_oppo": {0: "b"}, "logits_move": {0: "b"}, "logits_value": {0: "b"}}, opset_version=17, dynamo=False)
with torch.no_grad(): ref = w(tok, es, eo)
sess = ort.InferenceSession(out)
o = sess.run(None, {"tokens": tok.numpy(), "elo_self": es.numpy(), "elo_oppo": eo.numpy()})
print("max abs diff move", float(np.abs(o[0] - ref[0].numpy()).max()), "value", float(np.abs(o[1] - ref[1].numpy()).max()))
print("sha256", hashlib.sha256(open(out, "rb").read()).hexdigest())
