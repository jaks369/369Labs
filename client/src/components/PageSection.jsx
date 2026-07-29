import { motion } from "motion/react";

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06 },
  },
};

const childVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.19, 1, 0.22, 1] },
  },
};

export function PageContainer({ children, ...props }) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function PageSection({ children, ...props }) {
  return (
    <motion.div variants={childVariants} {...props}>
      {children}
    </motion.div>
  );
}
