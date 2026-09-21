import React, { useState, useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import { formatTimerSeconds } from '../utils/workMetrics';

/**
 * Break Timer Component
 * Runs continuously from break startedAt timestamp.
 */
export const BreakTimer = ({ startedAt, style }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) {
      setElapsed(0);
      return;
    }

    const calc = () => {
      const ms = Date.now() - new Date(startedAt).getTime();
      return Math.max(0, Math.floor(ms / 1000));
    };

    setElapsed(calc());
    const interval = setInterval(() => setElapsed(calc()), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return (
    <Text style={[styles.timerText, style]}>
      {formatTimerSeconds(elapsed)}
    </Text>
  );
};

const styles = StyleSheet.create({
  timerText: {
    fontFamily: 'monospace',
    fontSize: 28,
    fontWeight: '800',
    color: '#b45309',
    letterSpacing: 1.2,
  },
});

export default BreakTimer;
