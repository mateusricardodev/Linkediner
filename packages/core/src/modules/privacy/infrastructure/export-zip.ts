import JSZip from 'jszip';
import type { BuildExportZip } from '../application/data-export';

const README = `Estes são os seus dados no LinkedIner.

dados.json: seus dados, separados por tabela.
documentos/: os arquivos que você enviou e que ainda não expiraram.

Por segurança, o arquivo não inclui senha nem sessões de login.
Guarde este arquivo em lugar seguro: ele contém seus dados pessoais.
`;

export const buildExportZip: BuildExportZip = async ({ data, files, missingFiles }) => {
  const zip = new JSZip();
  zip.file('LEIA-ME.txt', README);
  zip.file('dados.json', JSON.stringify({ ...data, missingFiles }, null, 2));
  for (const file of files) zip.file(file.path, file.bytes);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
};
