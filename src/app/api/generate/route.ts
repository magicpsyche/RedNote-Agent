import { NextResponse } from "next/server";

import { generateAll } from "@/app/actions/generate";
import type { ProductInput } from "@/types/schema";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ProductInput;
    const result = await generateAll(payload);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Generate API error", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "生成失败" },
      { status: 500 }
    );
  }
}
