import { useEffect, useState } from "react";
import { motion, useSpring, useMotionValue, useMotionValueEvent } from "motion/react";

export default function AnimatedNumber({ value, format = (v) => v, springConfig = { stiffness: 100, damping: 30, precision: 0.01 }, ...props }) {
  const [display, setDisplay] = useState(format(value));
  const motionValue = useMotionValue(value);
  const spring = useSpring(motionValue, springConfig);

  useMotionValueEvent(spring, "change", (v) => setDisplay(format(v)));

  useEffect(() => { motionValue.set(value); }, [value, motionValue]);

  return <motion.span {...props}>{display}</motion.span>;
}
