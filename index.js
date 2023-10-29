import * as VDF from 'vdf-parser';
import * as fsPromises from 'fs/promises';
import * as fs from 'fs';
import { Readable } from 'stream';
import { finished } from 'stream/promises';

const baseDirectory = "archive";
const archivedLocally = async (version) => new Promise(resolve => {
    fsPromises.access(`${baseDirectory}/${version}`).then(() => resolve(true)).catch(() => resolve(false));
});
const archivedOnGithub = async (version) => {
    const response = await fetch(`https://github.com/fjch1997/steam-client-archive/releases/${version}`);
    switch (response.status) {
        case 200:
            return true;
        case 404:
            return false;
        default:
            throw new Error(`Github returned status code ${response.status} while checking whether the current Steam version had already been archiveds.`)
    }
}
const manifestText = await (await fetch("https://media.steampowered.com/client/steam_client_win32")).text();
const manifest = VDF.parse(manifestText);
const version = manifest.win32.version.toString();
const allFilesInManifest = (manifestObject) => {
    if (typeof manifestObject !== "object") {
        return [];
    }
    const keys = Object.entries(manifestObject);
    const isFile = (name) => name === "file" || name === "zipvz";
    const files = keys.filter(k => isFile(k[0])).map(i => i[1])
    const children = keys.filter(k => !isFile(k[0])).map(i => i[1])
    return [...files, ...children.map(i => allFilesInManifest(i)).flat()];
}
const downloadFile = (async (url, filename) => {
    console.log(`Downloading ${filename}.`);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Server status code ${response.status} does not indicate success.`);
    }
    const fileStream = fs.createWriteStream(`${baseDirectory}/${version}/${filename}`, { flags: 'wx' });
    await finished(Readable.fromWeb(response.body).pipe(fileStream));
});
const archiveNeeded = !await archivedLocally(version) && !await archivedOnGithub(version);
if (archiveNeeded) {
    console.log(`Archiving Steam version ${version}.`);
    await fsPromises.mkdir(`${baseDirectory}/${version}`, { recursive: true });
    await fsPromises.writeFile(`${baseDirectory}/${version}/steam_client_win32`, manifestText);
    await downloadFile("https://cdn.cloudflare.steamstatic.com/client/installer/SteamSetup.exe", "SteamSetup.exe");
    for (const file of await allFilesInManifest(manifest)) {
        await downloadFile(`https://media.steampowered.com/client/${file}`, file);
    }
    console.log(`Archive of Steam version ${version} successful.`);
} else {
    console.log("This version of Steam is already archived.");
}
if (process.env.GITHUB_OUTPUT) {
    await fsPromises.writeFile(process.env.GITHUB_OUTPUT, `NewVersionArchived=${archiveNeeded}\nVersion=${version}`);
}
