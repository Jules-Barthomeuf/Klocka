import React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area } from 'recharts';

export const ComparatifChart = React.memo(function ComparatifChart({ chartData, projets, frequence, apportData, apportTotal }) {
  
  const CustomArrow = ({ x, y, multiple, year }) => (
    <g>
      <defs>
        <marker
          id={`arrowhead-${year}`}
          markerWidth="8"
          markerHeight="8"
          refX="4"
          refY="4"
          orient="auto-start-reverse"
        >
          <polygon points="0 0, 8 4, 0 8" fill="#aab6f5" />
        </marker>
      </defs>
      
      {/* Flèche verticale */}
      <line
        x1={x}
        y1={y + 40}
        x2={x}
        y2={y - 40}
        stroke="#aab6f5"
        strokeWidth="2"
        markerEnd={`url(#arrowhead-${year})`}
      />
      
      {/* Badge avec multiple */}
      <rect
        x={x - 30}
        y={y - 15}
        width="60"
        height="30"
        rx="15"
        fill="#8fa0f2"
      />
      <text
        x={x}
        y={y + 5}
        textAnchor="middle"
        fill="#fff"
        fontSize="12"
        fontWeight="bold"
      >
        {multiple}x
      </text>
    </g>
  );

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={chartData}>
        <defs>
          <linearGradient id="patrimoineGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8fa0f2" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#8fa0f2" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#2c3139" />
        <XAxis
          dataKey="annee"
          stroke="#9298a6"
          tick={{ fontSize: 12, fill: '#9298a6' }}
          label={{ value: 'Année', position: 'insideBottom', offset: -5, fill: '#9298a6' }}
        />
        <YAxis
          stroke="#9298a6"
          tick={{ fontSize: 12, fill: '#9298a6' }}
          tickFormatter={(value) => {
            if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
            return `${(value / 1000).toFixed(0)}K`;
          }}
          label={{ value: 'Euros', angle: -90, position: 'insideLeft', fill: '#9298a6' }}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#0c0d10', border: '1px solid #2c3139', borderRadius: '8px', color: '#fff' }}
          labelStyle={{ color: '#fff' }}
          formatter={(value) => {
            if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M €`;
            return `${(value / 1000).toFixed(0)}K €`;
          }}
        />
        <Legend />
        
        <Line
          type="stepAfter"
          dataKey={(entry) => {
            let currentValue = 0;
            projets.forEach((projet, idx) => {
              const acquisitionYear = idx * frequence;
              if (acquisitionYear < entry.annee) {
                const apport = apportData[projet.taille];
                const yearsHeld = entry.annee - 1 - acquisitionYear;
                const valueWithInterest = apport * Math.pow(1.03, yearsHeld);
                currentValue += valueWithInterest;
              }
            });
            return Math.round(currentValue);
          }}
          stroke="#a9c5b9"
          strokeWidth={3}
          strokeDasharray="8 4"
          name="Livret A (3%)"
          dot={false}
        />

        <Area
          type="monotone"
          dataKey="patrimoine"
          stroke="#8fa0f2"
          strokeWidth={3}
          fill="url(#patrimoineGradient)"
          name="Patrimoine net"
        />

        <Line
          type="monotone"
          dataKey="patrimoine"
          stroke="#8fa0f2"
          strokeWidth={4}
          name=""
          dot={false}
          legendType="none"
        />

        {/* Flèches et annotations */}
        {[10, 20].map((year) => {
          const dataPoint = chartData[year - 1];
          if (!dataPoint) return null;
          
          const multiple = (dataPoint.patrimoine / apportTotal).toFixed(1);
          
          // Calculer position approximative
          const chartWidth = 800; // Approximation
          const chartHeight = 400;
          const x = 100 + ((year - 1) / 29) * 600; // Position X approximative
          const y = chartHeight / 2; // Position Y au milieu
          
          return (
            <CustomArrow
              key={year}
              x={x}
              y={y}
              multiple={multiple}
              year={year}
            />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
});