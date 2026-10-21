import { NextResponse } from 'next/server';
import { COMPETITIONS } from '@/lib/data/seedData';

export async function GET() {
  return NextResponse.json({
    data: COMPETITIONS,
    total: COMPETITIONS.length,
    timestamp: new Date().toISOString(),
  });
}
