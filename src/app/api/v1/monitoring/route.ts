import { NextResponse } from 'next/server';
import { marketMonitor } from '@/lib/prediction/marketMonitor';
import { FAMILY_VALIDATION_REGISTRY } from '@/lib/prediction/marketGating';

export async function GET() {
  const report = marketMonitor.getReport(100, 0.40);
  return NextResponse.json({
    report,
    familyRegistry: FAMILY_VALIDATION_REGISTRY,
    timestamp: new Date().toISOString(),
  });
}
