import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { G, Circle } from 'react-native-svg';

/**
 * DonutChart Component for React Native
 * Direct parity with apps/employee/src/components/timechamp/DonutChart.jsx
 * Displays radial distribution of Productive Work, Completed Breaks, and Remaining Shift.
 */
export default function DonutChart({
  data = [],
  centerLabel = '',
  centerValue = '',
  size = 180,
  strokeWidth = 18,
}) {
  const total = data.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // If total is 0, show a single placeholder slice
  const segments =
    total === 0
      ? [{ name: 'No Data', value: 1, color: '#e2e8f0', pct: 100 }]
      : data.map((d) => ({
          ...d,
          pct: total > 0 ? (Number(d.value) || 0) / total : 0,
        }));

  // Calculate cumulative offsets for each segment
  let cumulativePct = 0;
  const renderedSlices = segments.map((item, idx) => {
    const strokeDasharray = `${circumference * item.pct} ${circumference * (1 - item.pct)}`;
    const strokeDashoffset = -circumference * cumulativePct;
    cumulativePct += item.pct;

    return (
      <Circle
        key={`slice-${idx}`}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={item.color || '#0ea5e9'}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        fill="transparent"
      />
    );
  });

  return (
    <View style={styles.container}>
      <View style={[styles.chartWrapper, { width: size, height: size }]}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Background track */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#f1f5f9"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Rotated group so arcs start at 12 o'clock (-90 deg) */}
          <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
            {renderedSlices}
          </G>
        </Svg>

        {(centerValue || centerLabel) && (
          <View style={styles.centerTextContainer}>
            {Boolean(centerValue) && (
              <Text style={styles.centerValueText}>{centerValue}</Text>
            )}
            {Boolean(centerLabel) && (
              <Text style={styles.centerLabelText}>{centerLabel}</Text>
            )}
          </View>
        )}
      </View>

      {/* Legend & Progress bars */}
      <View style={styles.legendContainer}>
        {data.map((item, idx) => {
          const pct = total > 0 ? Math.round(((item.value || 0) / total) * 100) : 0;
          return (
            <View key={`legend-${idx}`} style={styles.legendItem}>
              <View style={styles.legendHeaderRow}>
                <View style={styles.legendTitleGroup}>
                  <View
                    style={[
                      styles.legendDot,
                      { backgroundColor: item.color || '#0ea5e9' },
                    ]}
                  />
                  <Text style={styles.legendNameText} numberOfLines={1}>
                    {item.name}
                  </Text>
                </View>
                <View style={styles.legendValueGroup}>
                  <Text style={styles.legendValueText}>
                    {item.displayValue || item.value}
                  </Text>
                  <Text style={styles.legendPctText}>({pct}%)</Text>
                </View>
              </View>
              {/* Progress bar track */}
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressBar,
                    {
                      width: `${Math.min(100, Math.max(0, pct))}%`,
                      backgroundColor: item.color || '#0ea5e9',
                    },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
    paddingVertical: 8,
  },
  chartWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  centerTextContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerValueText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    fontFamily: 'monospace',
  },
  centerLabelText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  legendContainer: {
    width: '100%',
    gap: 12,
  },
  legendItem: {
    width: '100%',
  },
  legendHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  legendTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  legendNameText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    flexShrink: 1,
  },
  legendValueGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendValueText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
    color: '#0f172a',
  },
  legendPctText: {
    fontSize: 11,
    color: '#94a3b8',
    fontFamily: 'monospace',
    minWidth: 38,
    textAlign: 'right',
  },
  progressTrack: {
    height: 6,
    width: '100%',
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 999,
  },
});
