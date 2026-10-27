import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

const STATUS_COLORS = {
  placed: '#627d98',    // Navy-500
  converted: '#10b981',   // Emerald-500
  rejected: '#ef4444',  // Red-500
  pending: '#9fb3c8',   // Navy-300
  retracted: '#64748b', // Slate-500
  error: '#dc2626',     // Red-600
};

const STATUS_LABELS = {
  placed: 'Placed',
  converted: 'Converted',
  rejected: 'Rejected',
  pending: 'Pending',
  retracted: 'Retracted',
  error: 'Error',
};

const RADIAN = Math.PI / 180;

function renderInnerLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  // Only show percentage inside slices that are large enough to fit text
  if (percent < 0.08) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export default function StatusDistributionChart({ data }) {
  const chartData = Object.entries(data)
    .filter(([_, value]) => value > 0)
    .map(([status, count]) => ({
      name: STATUS_LABELS[status] || status,
      value: count,
      color: STATUS_COLORS[status] || '#64748b',
    }));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-sm text-slate-400">
        No bid status data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={renderInnerLabel}
          outerRadius={110}
          dataKey="value"
          stroke="#fff"
          strokeWidth={3}
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, name) => [value, name]}
          contentStyle={{
            backgroundColor: 'rgba(255, 255, 255, 0.98)',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '12px 16px',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
          }}
        />
        <Legend wrapperStyle={{ fontSize: '12px' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
