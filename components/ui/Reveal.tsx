"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

export const EASE = [0.16, 1, 0.3, 1] as const;

interface RevealProps extends Omit<HTMLMotionProps<"div">, "ref"> {
  delay?: number;
  y?: number;
  /** Animate on scroll-into-view (default) vs immediately on mount. */
  onView?: boolean;
  once?: boolean;
}

/** A small, consistent fade-up wrapper used across pages. */
export function Reveal({
  children,
  delay = 0,
  y = 18,
  onView = true,
  once = true,
  className,
  ...rest
}: RevealProps) {
  const anim = {
    initial: { opacity: 0, y },
    transition: { duration: 0.8, ease: EASE, delay },
  } as const;

  if (onView) {
    return (
      <motion.div
        className={cn(className)}
        initial={anim.initial}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once, margin: "-12% 0px" }}
        transition={anim.transition}
        {...rest}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      className={cn(className)}
      initial={anim.initial}
      animate={{ opacity: 1, y: 0 }}
      transition={anim.transition}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
