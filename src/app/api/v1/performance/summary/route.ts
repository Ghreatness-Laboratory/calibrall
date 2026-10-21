import { NextResponse } from 'next/server';
import { VERIFIED_PERFORMANCE_REPORT } from '@/lib/data/seedData';

export async function GET() {
  return NextResponse.json({
    report: VERIFIED_PERFORMANCE_REPORT,
    timestamp: new Date().toISOString(),
    auditStatus: 'VERIFIED_IMMUTABLE',
  });
}
