import { NextResponse } from 'next/server';
import { getSimplifiedDecisions } from '@/lib/decisions'; // check your path

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  const limit = parseInt(searchParams.get('limit') || '5', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  const data = await getSimplifiedDecisions(limit, offset);
  return NextResponse.json(data);
}