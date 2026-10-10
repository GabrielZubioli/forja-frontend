// Vetoriza as máscaras da logo (preto = forma) e grava os caminhos em JSON.
// Uso: node trace.cjs <pasta-das-mascaras>
const path = require("path");
const fs = require("fs");
const { Potrace } = require("potrace");

const dir = process.argv[2];
const partes = ["simbolo", "habitual", "fit"];
const out = {};

const proxima = (i) => {
  if (i >= partes.length) {
    fs.writeFileSync(path.join(dir, "paths.json"), JSON.stringify(out));
    console.log("ok", Object.keys(out).map((k) => `${k}:${out[k].d.length}`).join(" "));
    return;
  }
  const nome = partes[i];
  const t = new Potrace({ threshold: 128, turdSize: 40, optTolerance: 1.2, alphaMax: 1 });
  t.loadImage(path.join(dir, `${nome}-mask.png`), (err) => {
    if (err) throw err;
    const tag = t.getPathTag();
    const d = /d="([^"]+)"/.exec(tag)[1];
    out[nome] = { d, w: t._luminanceData.width, h: t._luminanceData.height };
    proxima(i + 1);
  });
};
proxima(0);
