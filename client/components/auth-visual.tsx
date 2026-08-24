export function AuthVisual() {
  return (
    <div
      aria-hidden
      className="relative h-full w-full overflow-hidden bg-[#251812]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_28%,#d4a24d_0_7%,transparent_28%),radial-gradient(circle_at_72%_65%,#7b3f27_0_10%,transparent_34%),repeating-linear-gradient(120deg,transparent_0_42px,rgba(255,255,255,0.035)_43px_44px)]" />
      <div className="absolute inset-x-[18%] bottom-[16%] h-px bg-[#d4a24d]/70" />
      <div className="absolute bottom-[13%] left-[18%] font-display text-2xl tracking-[0.24em] text-[#f8ecd1]">
        CROWBAR
      </div>
    </div>
  );
}
