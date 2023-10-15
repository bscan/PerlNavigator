import "process";
import { tmpdir } from "os";
import { rmdirSync, mkdirSync, mkdtempSync, createReadStream, createWriteStream } from "fs";
import { dirname, join } from "path";

let haveExtractedAssets = false;
let pkgAssetPath: string;

function extractAssetsIfNecessary(): string {
    if (!haveExtractedAssets) {
        pkgAssetPath = mkdtempSync(join(tmpdir(), "perl-navigator"));
        let assets: string[] = [
            "src/perl/Inquisitor.pm",
            "src/perl/lib_bs22/Class/Inspector.pm",
            "src/perl/lib_bs22/Devel/Symdump.pm",
            "src/perl/lib_bs22/Devel/Symdump/Export.pm",
            "src/perl/lib_bs22/Inspectorito.pm",
            "src/perl/lib_bs22/ModHunter.pl",
            "src/perl/lib_bs22/SubUtilPP.pm",
            "src/perl/lib_bs22/SourceStash.pm",
            "src/perl/lib_bs22/pltags.pm",
            "src/perl/Inquisitor.pm",
            "src/perl/criticWrapper.pl",
            "src/perl/defaultCriticProfile",
            "src/perl/tidyWrapper.pl",
        ];

        assets.forEach((asset) => {
            let source = join(dirname(__dirname), asset);
            let dest = join(pkgAssetPath, asset);
            mkdirSync(dirname(dest), { recursive: true }); // Create all parent folders
            createReadStream(source).pipe(createWriteStream(dest));
        });

        haveExtractedAssets = true;
    }
    return pkgAssetPath;
}

export function getAssetsPath(): string {
    let anyProcess = <any>process;
    if (anyProcess.pkg) {
        // When running inside of a pkg built executable, the assets
        // are available via the snapshot filesystem.  That file
        // system is only available through the node API, so the
        // assets need to be extracted in order to be accessible by
        // the perl command
        return extractAssetsIfNecessary();
    }

    return dirname(__dirname);
}

export function getPerlAssetsPath(): string {
    return join(getAssetsPath(), "src", "perl");
}

export function cleanupTemporaryAssetPath() {
    if (haveExtractedAssets) {
        rmdirSync(pkgAssetPath, { recursive: true }); // Create all parent folders
        haveExtractedAssets = false;
    }
}
