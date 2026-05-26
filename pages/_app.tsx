import Head from 'next/head';
import type { AppProps } from 'next/app';
import '../styles/dashboard.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="googlebot" content="noindex, nofollow" />
        <meta name="bingbot" content="noindex, nofollow" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
