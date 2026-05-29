import './globals.css'

export const metadata = {
  title: 'Office Monitor — Ray & Co',
  description: 'Employee activity monitoring dashboard',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}