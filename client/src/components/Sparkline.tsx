import { LineChart, Line, ResponsiveContainer } from "recharts";

interface SparklineProps {
  data: Array<{ value: number }>;
  color?: string;
  height?: number;
  width?: string | number;
  trend?: "up" | "down" | "neutral";
}

export default function Sparkline({
  data,
  color = "var(--amber)",
  height = 40,
  width = "100%",
  trend,
}: SparklineProps) {
  if (!data || data.length === 0) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center text-[var(--amber)]/40 text-xs"
      >
        No data
      </div>
    );
  }

  // Determine trend color if not specified
  let lineColor = color;
  if (!trend && data.length > 1) {
    const firstValue = data[0].value;
    const lastValue = data[data.length - 1].value;
    if (lastValue > firstValue) {
      lineColor = "var(--green)"; // Green for up
    } else if (lastValue < firstValue) {
      lineColor = "var(--red)"; // Red for down
    }
  } else if (trend === "up") {
    lineColor = "var(--green)";
  } else if (trend === "down") {
    lineColor = "var(--red)";
  }

  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart
        data={data}
        margin={{ top: 2, right: 2, left: 2, bottom: 2 }}
      >
        <Line
          type="monotone"
          dataKey="value"
          stroke={lineColor}
          dot={false}
          isAnimationActive={false}
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
