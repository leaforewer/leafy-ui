import type React from "react";
import { useEffect, useRef, useState } from "react";

export type SmallCarouselImage = {
  url: string;
  alt?: string;
};

export type trackStyle = "pill" | "line" | "skewed" | "dot";

export function SmallImageCarousel({
  images,
  className,
  trackStyle,
}: {
  images: SmallCarouselImage[];
  className?: string;
  trackStyle?: trackStyle;
}) {
  const hasMultipleImages = images?.length > 1;

  const carouselRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const [index, setIndex] = useState(0);
  const [startX, setStartX] = useState<number | null>(null);
  const [dragX, setDragX] = useState(0);

  const total = images.length;

  const handleStart = (e: React.TouchEvent | React.MouseEvent) => {
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    setStartX(clientX);
  };

  const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (startX === null) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    setDragX(clientX - startX);
  };

  const handleEnd = () => {
    if (startX === null || !carouselRef.current) return;
    const width = carouselRef.current.offsetWidth;
    const threshold = width * 0.2;

    if (dragX > threshold && index > 0) setIndex(index - 1);
    else if (dragX < -threshold && index < total - 1) setIndex(index + 1);

    setStartX(null);
    setDragX(0);
  };

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !carouselRef.current) return;

    const width = carouselRef.current.offsetWidth;
    const dragPercent = startX ? (dragX / width) * 100 : 0;
    const translate = -index * 100 + dragPercent;

    track.style.transform = `translateX(${translate}%)`;
    track.style.transition = startX ? "none" : "transform 0.3s ease-out";
  }, [index, dragX, startX]);

  const handleDotClick = (i: number) => setIndex(i);

  return (
    <div
      className={`product-image-carousel ${className || ""}`}
      role="slider"
      tabIndex={0}
      aria-valuemin={0}
      aria-valuemax={images.length - 1}
      aria-valuenow={index}
      aria-orientation="horizontal"
      ref={carouselRef}
      onMouseDown={handleStart}
      onMouseMove={handleMove}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={handleStart}
      onTouchMove={handleMove}
      onTouchEnd={handleEnd}
    >
      <div className="carousel-wrapper">
        <div className="carousel" data-images={images.length} ref={trackRef}>
          {images.map((image: SmallCarouselImage, index: number) => (
            <div
              key={`${image.url}-${index}`}
              className="carousel-item"
              data-slide={index}
            >
              <img
                src={image.url}
                alt={image.alt || `Slide ${index + 1}`}
                width="173"
                height="127"
                sizes="(max-width: 768px) 127px, 173px"
                draggable={false}
              />
            </div>
          ))}
        </div>
      </div>

      {hasMultipleImages && (
        <div className="carousel-tracks">
          {images.map((image: SmallCarouselImage, i: number) => (
            <button
              key={`${image.url}-dot-${i}`}
              type="button"
              className={`carousel-track ${trackStyle || "dot"} ${i === index ? "active" : ""}`}
              data-slide-to={i}
              aria-label={`Go to image ${i + 1}`}
              onClick={() => handleDotClick(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
