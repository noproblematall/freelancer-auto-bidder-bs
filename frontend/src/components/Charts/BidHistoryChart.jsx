import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';

export default function BidHistoryChart({ data, period }) {
  const formatDate = (dateStr) => {
    try {
      const date = parseISO(dateStr);
      return period === '7d' ? format(date, 'MMM dd') : format(date, 'MMM dd, yyyy');
    } catch {
      return dateStr;
    }
  };

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-sm text-slate-400">
        No bid data available for this period
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.7} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          stroke="#64748b"
          style={{ fontSize: '12px' }}
          interval={period === '7d' ? 0 : period === '30d' ? 3 : 11}
        />
        <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
        <Tooltip
          labelFormatter={formatDate}
          contentStyle={{
            backgroundColor: 'rgba(255, 255, 255, 0.98)',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '12px 16px',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
          }}
        />
        <Legend wrapperStyle={{ fontSize: '12px' }} />
        <Line
          type="monotone"
          dataKey="total"
          stroke="#334e68"
          strokeWidth={3}
          name="Total Bids"
          dot={{ r: 4, fill: '#334e68', strokeWidth: 2, stroke: '#fff' }}
          activeDot={{ r: 6, fill: '#334e68', stroke: '#fff', strokeWidth: 2 }}
        />
        <Line
          type="monotone"
          dataKey="placed"
          stroke="#627d98"
          strokeWidth={3}
          name="Placed"
          dot={{ r: 4, fill: '#627d98', strokeWidth: 2, stroke: '#fff' }}
          activeDot={{ r: 6, fill: '#627d98', stroke: '#fff', strokeWidth: 2 }}
        />
        <Line
          type="monotone"
          dataKey="converted"
          stroke="#10b981"
          strokeWidth={3}
          name="Converted"
          dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
          activeDot={{ r: 6, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
