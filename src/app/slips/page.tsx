import React from 'react';
import SlipBuilderView from '@/components/slips/SlipBuilderView';

export const metadata = {
  title: 'Slip Builder · Calibrall',
  description: 'Build multi leg match combinations from calibrated probabilities and stored prices.',
};

export default function SlipsPage() {
  return <SlipBuilderView />;
}
