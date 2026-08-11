import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart, ReferenceDot } from 'recharts';

export default function CreationRichesseGraphs({
  currentGraphIndex,
  graphDataCreationRichesse,
  anneeRevente,
  apport,
  anneeRecuperationDouble,
  calculs,
  formatCurrency,
  textClass,
  mutedClass,
}) {
  if (currentGraphIndex === 0) {
    return (
      <div>
        <div className="h-[280px] md:h-[400px] bg-black rounded-xl border border-white/[0.08] p-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={graphDataCreationRichesse}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="annee"
                stroke="#9ca3af"
                tick={{ fontSize: 12, fontFamily: 'Montserrat, sans-serif' }}
                label={{ value: '(année)', position: 'insideBottom', offset: -10, fill: '#9ca3af', fontSize: 11, fontFamily: 'Montserrat, sans-serif' }}
                height={50}
              />
              <YAxis
                stroke="#9ca3af"
                tick={{ fontSize: 12, fontFamily: 'Montserrat, sans-serif' }}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}`}
                label={{ value: "(en milliers d'euros)", angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 11, fontFamily: 'Montserrat, sans-serif', dy: -20 }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    const totalAnnuel = data.cashFlowAnnuel + data.capitalAnnuel;
                    return (
                      <div style={{
                        backgroundColor: '#1a1a1a',
                        border: '1px solid #374151',
                        borderRadius: '8px',
                        padding: '12px',
                        color: '#fff',
                        fontFamily: 'Montserrat, sans-serif'
                      }}>
                        <p style={{ fontWeight: 'bold', marginBottom: '8px', color: '#fff' }}>Année {data.annee} : {formatCurrency(totalAnnuel)}</p>
                        <p style={{ color: '#71CCBA', marginBottom: '8px' }}>
                          Capital remboursé : {formatCurrency(data.capitalAnnuel)}
                        </p>
                        <p style={{ color: '#2A9D8F' }}>
                          Cash-flow : {formatCurrency(data.cashFlowAnnuel)}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend wrapperStyle={{ paddingTop: '20px', fontFamily: 'Montserrat, sans-serif' }} />
              <Bar dataKey="capitalAnnuel" fill="#71CCBA" name="Capital remboursé" radius={[4, 4, 0, 0]} />
              <Bar dataKey="cashFlowAnnuel" fill="#1a7a6f" name="Cash-flow annuel" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className={`text-sm ${mutedClass} mt-4 text-center`}>
          Décomposition de la richesse créée chaque année
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="h-[280px] md:h-[400px] bg-black rounded-xl border border-white/[0.08] p-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={graphDataCreationRichesse}>
            <defs>
              <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.9} />
                <stop offset="95%" stopColor="#D4AF37" stopOpacity={0.3} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="annee"
              stroke="#9ca3af"
              tick={{ fontSize: 12, fontFamily: 'Montserrat, sans-serif' }}
              label={{ value: '(année)', position: 'insideBottom', offset: -10, fill: '#9ca3af', fontSize: 11, fontFamily: 'Montserrat, sans-serif' }}
              height={50}
            />
            <YAxis
              stroke="#9ca3af"
              tick={{ fontSize: 12, fontFamily: 'Montserrat, sans-serif' }}
              tickFormatter={(value) => `${(value / 1000).toFixed(0)}`}
              label={{ value: "(en milliers d'euros)", angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 11, fontFamily: 'Montserrat, sans-serif', dy: -20 }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  const isLastYear = data.annee === anneeRevente;
                  return (
                    <div style={{
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      padding: '12px',
                      color: '#fff',
                      fontFamily: 'Montserrat, sans-serif'
                    }}>
                      <p style={{ fontWeight: 'bold', marginBottom: '8px', color: '#fff' }}>Année {data.annee} : {formatCurrency(data.totalCumule)}</p>
                      {data.isRecuperationApport &&
                        <p style={{ color: '#F59E0B', marginBottom: '8px', fontWeight: 'bold' }}>
                          🎯 Vous récupérez votre apport en {data.annee} ans
                        </p>
                      }
                      {data.isDoubleApport &&
                        <p style={{ color: '#8B5CF6', marginBottom: '8px', fontWeight: 'bold' }}>
                          🚀 Vous doublez votre apport en {data.annee} ans
                        </p>
                      }
                      {isLastYear &&
                        <p style={{ color: '#fff', marginTop: '8px', fontWeight: 'bold', borderTop: '1px solid #374151', paddingTop: '8px' }}>
                          🏆 Votre apport a fait un multiple de x{calculs.indicateurs.multipleNetFondsPropres}
                        </p>
                      }
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend wrapperStyle={{ paddingTop: '20px', fontFamily: 'Montserrat, sans-serif' }} />
            <Area type="monotone" dataKey="totalCumule" stroke="#D4AF37" strokeWidth={3} fill="url(#colorTotal)" name="Richesse cumulée" />
            {graphDataCreationRichesse.filter((d) => d.isRecuperationApport).map((point, idx) =>
              <ReferenceDot
                key={`apport-${idx}`}
                x={point.annee}
                y={point.totalCumule}
                r={6}
                fill="#F59E0B"
                stroke="none"
              />
            )}
            {graphDataCreationRichesse.filter((d) => d.isDoubleApport).map((point, idx) =>
              <ReferenceDot
                key={`double-${idx}`}
                x={point.annee}
                y={point.totalCumule}
                r={6}
                fill="#8B5CF6"
                stroke="none"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full bg-[#F59E0B]"></div>
            <p className={`text-sm font-medium ${textClass}`}>Récupération de l'apport</p>
          </div>
          <p className={`text-xs ${mutedClass}`}>
            {calculs.indicateurs.anneeRecuperationApport ?
              `Année ${calculs.indicateurs.anneeRecuperationApport} - Vous récupérez vos ${formatCurrency(apport)}` :
              'Non atteint sur la période'}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full bg-[#8B5CF6]"></div>
            <p className={`text-sm font-medium ${textClass}`}>Double de l'apport</p>
          </div>
          <p className={`text-xs ${mutedClass}`}>
            {anneeRecuperationDouble ?
              `Année ${anneeRecuperationDouble} - Vous atteignez ${formatCurrency(apport * 2)}` :
              'Non atteint sur la période'}
          </p>
        </div>
      </div>
    </div>
  );
}