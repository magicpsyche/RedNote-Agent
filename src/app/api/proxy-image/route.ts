import { NextResponse } from "next/server";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,Range",
  "Access-Control-Expose-Headers": "Content-Type,Content-Length",
};

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get("url");

  if (!target) {
    return NextResponse.json(
      { message: "缺少 url 参数" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json(
      { message: "无效的 url" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return NextResponse.json(
      { message: "仅支持 http/https 图片地址" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: { Accept: "image/*" },
      cache: "no-store",
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { message: `上游请求失败: ${upstream.status}` },
        { status: 502, headers: CORS_HEADERS }
      );
    }

    const response = new NextResponse(upstream.body, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
        "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=43200",
      },
    });

    return response;
  } catch (error) {
    console.error("[proxy-image] 代理失败", error);
    return NextResponse.json(
      { message: "图片代理失败" },
      { status: 502, headers: CORS_HEADERS }
    );
  }
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}
