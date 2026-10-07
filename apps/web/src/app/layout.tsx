import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'TurkishPix • Siyasi Sistem',description:'TurkishPix parti başvuruları, halk oylamaları, TBMM ve seçim paneli.',robots:{index:false,follow:false}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="tr" suppressHydrationWarning><body>{children}</body></html>;}
