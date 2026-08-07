import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/lib/store";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NG Marshal — Fleet, Equipment & Control",
  description: "The master control hub for container-yard operations — verified trips, live incentives, equipment tracking, planning and command center. Pilot: Mundra EXIM Yard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#EDF0F4] text-[#16243A]">
        {/* Field-device fast-path: before the web landing paints, send the phone straight
            to login / the person's view. Runs during HTML parse (Capacitor bridge + saved
            identity are already present), so the console home never flashes on the app.
            ?stay=1 or any non-root path opts out. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
if(location.pathname!=='/')return;
if(new URLSearchParams(location.search).get('stay')==='1')return;
var native=!!window.Capacitor,raw=null;try{raw=localStorage.getItem('ng-marshal-identity-v1');}catch(e){}
var role=null;if(raw){try{role=JSON.parse(raw).role;}catch(e){}}
var home=role==='driver'?'/driver':role==='operator'?'/operator':role==='supervisor'?'/supervisor':null;
if(home){location.replace(home);return;}
if(native){location.replace('/m');}
}catch(e){}})();`,
          }}
        />
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
