import { NextResponse } from 'next/server';
import { COMPETITIONS } from '@/lib/data/seedData';

export const dynamic = 'force-dynamic';
export const revalidate = 120;

export async function GET() {
  return NextResponse.json({
    data: COMPETITIONS,
    total: COMPETITIONS.length,
    timestamp: new Date().toISOString(),
  });
}
