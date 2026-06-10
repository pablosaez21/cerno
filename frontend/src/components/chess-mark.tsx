const pieces = ["♜", "", "", "♚", "", "♟", "♟", "", "", "♙", "", "", "♖", "", "", "♔"];

export function ChessMark() {
  return (
    <div
      className="grid aspect-square w-full max-w-[260px] grid-cols-4 overflow-hidden rounded-[6px] border border-[#bdc9c2] shadow-[0_18px_50px_rgba(23,33,29,0.12)]"
      aria-hidden="true"
    >
      {pieces.map((piece, index) => (
        <div
          key={index}
          className={`grid aspect-square place-items-center text-2xl sm:text-3xl ${
            (Math.floor(index / 4) + index) % 2 === 0
              ? "bg-[#e8ede9] text-[#17211d]"
              : "bg-[#355f50] text-white"
          }`}
        >
          {piece}
        </div>
      ))}
    </div>
  );
}
