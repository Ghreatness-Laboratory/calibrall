import React from 'react';
import HomeClient from '@/components/HomeClient';

export const dynamic = 'force-dynamic';
export const revalidate = 120;

export default function HomePage() {
  return <HomeClient />;
}
