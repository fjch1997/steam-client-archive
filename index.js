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
    const response = await fetch(`https://github.com/fjch1997/steam-client-archive/releases/tag/${version}`);
    switch (response.status) {
        case 200:
            return true;
        case 404:
            return false;
        default:
            throw new Error(`Github returned status code ${response.status} while checking whether the current Steam version had already been archiveds.`)
    }
}
const manifestText = async (platform) => await (await fetch(`https://media.steampowered.com/client/steam_client_${platform}`)).text();
const manifestTexts = {
    win32: await manifestText("win32"),
    ubuntu12: await manifestText("ubuntu12"),
    osx: await manifestText("osx"),
};
const manifests = {
    win32: VDF.parse(manifestTexts.win32).win32,
    ubuntu12: VDF.parse(manifestTexts.ubuntu12).ubuntu12,
    osx: VDF.parse(manifestTexts.osx).osx,
}
const versions = [manifests.win32.version, manifests.ubuntu12.version, manifests.osx.version];
const version = manifests.win32.version;
if (versions.some(v => v !== version)) {
    throw new Error(`Steam returned different versions for different platforms.\nwin32: ${versions[0]}. Linux: ${versions[1]}. Mac: ${versions[2]}`);
}
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
const manifestsArray = [manifests.win32, manifests.ubuntu12, manifests.osx];
const files = [...new Set(manifestsArray.map(m => allFilesInManifest(m)).flat())];
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
    await fsPromises.writeFile(`${baseDirectory}/${version}/steam_client_win32`, manifestTexts.win32);
    await fsPromises.writeFile(`${baseDirectory}/${version}/steam_client_ubuntu12`, manifestTexts.ubuntu12);
    await fsPromises.writeFile(`${baseDirectory}/${version}/steam_client_osx`, manifestTexts.osx);
    await downloadFile("https://cdn.cloudflare.steamstatic.com/client/installer/SteamSetup.exe", "SteamSetup.exe");
    await downloadFile("https://cdn.cloudflare.steamstatic.com/client/installer/steam.dmg", "steam.dmg");
    await downloadFile("https://cdn.cloudflare.steamstatic.com/client/installer/steam.deb", "steam.deb");
    for (const file of files) {
        await downloadFile(`https://media.steampowered.com/client/${file}`, file);
    }
    console.log(`Archive of Steam version ${version} successful.`);
} else {
    console.log("This version of Steam is already archived.");
}
if (process.env.GITHUB_OUTPUT) {
    await fsPromises.writeFile(process.env.GITHUB_OUTPUT, `NewVersionArchived=${archiveNeeded}\nVersion=${version}`);
}
