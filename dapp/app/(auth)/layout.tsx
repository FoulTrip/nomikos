/**
 * (auth)/layout — marco compartido de /signin y /signup con el mismo
 * lenguaje visual cálido de la landing (clase .landing).
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="landing relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden bg-white px-6 py-12 sm:px-0">
      {/* Resplandor beige suave */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[480px] max-w-3xl rounded-full bg-[#F2EBE0]/70 blur-[120px]"
      />

      <main className="relative flex w-full max-w-md flex-col items-center">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nomik-mark-dark.png" alt="Nomik" width={56} height={61} />
          <span className="text-3xl font-semibold tracking-tight">Nomik</span>
        </div>
      </main>

      {children}
    </div>
  );
}
