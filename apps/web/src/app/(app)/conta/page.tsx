import { redirect } from 'next/navigation';

/** A conta virou uma aba do perfil. O endereço antigo continua valendo para links já enviados. */
export default function AccountRedirect() {
  redirect('/perfil?tab=conta');
}
