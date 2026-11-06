import { redirect } from 'next/navigation';
import { HOME_PATH } from '../lib/safe-path';

export default function Home() {
  redirect(HOME_PATH);
}
