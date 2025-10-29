type Animation = "fade-slide-in" | "fade-in" | "slide-in";

export function AnimatedLetters({
  text,
  className,
  animation,
}: {
  text: string;
  className?: string;
  animation?: Animation;
}) {
  return (
    <div
      className={`leaf-animated-letters ${className}`}
      style={
        animation
          ? ({ "--anim": `leaf-${animation}` } as React.CSSProperties)
          : {}
      }
    >
      {text.split("").map((char, index) => (
        <span
          key={`char-${char}-${index}-${text.length}`}
          className="letter"
          style={{ "--i": index } as React.CSSProperties}
        >
          {char}
        </span>
      ))}
    </div>
  );
}
