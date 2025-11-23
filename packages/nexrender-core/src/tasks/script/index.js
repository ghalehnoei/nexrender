const fs     = require('fs')
const path   = require('path')
const script = require('../../assets/nexrender.jsx')

const wrapFootage = require('./wrap-footage')
const wrapData    = require('./wrap-data')
const wrapEnhancedScript = require('./wrap-enhanced-script')

module.exports = (job, settings) => {
    settings.logger.log(`[${job.uid}] running script assemble...`);

    const data = [];
    const base = job.workpath;

    job.assets.map(asset => {
        settings.trackCombined('Asset Script Wraps', {
            job_id: job.uid, // anonymized internally
            script_type: asset.type,
            script_compostion_set: asset.composition !== undefined,
            script_layer_strat: asset.layerName ? 'name' : 'index',
            script_value_strat:
                asset.value !== undefined ? 'value' : // eslint-disable-line no-nested-ternary, multiline-ternary
                asset.expression !== undefined ? 'expression' : // eslint-disable-line multiline-ternary
                undefined,
        })

        switch (asset.type) {
            case 'video':
            case 'audio':
            case 'image':
                data.push(wrapFootage(job, settings, asset));
                break;

            case 'data':
                data.push(wrapData(job, settings, asset));
                break;

            case 'script':
                data.push(wrapEnhancedScript(job, settings, asset));
                break;
        }
    });

    /* write out assembled custom script file in the workpath */
    job.scriptfile = path.join(base, `nexrender-${job.uid}-script.jsx`);
    
    // Persian ZWNJ fixer script to be appended at the end
    const persianZWNJScript = `
// Persian ZWNJ fixer across entire project (all comps, all text layers)
// Normalizes text then joins with ZWNJ for: می + فعل, ها, تر, ترین, ای, ی/ي, گر
// No alerts/prompts

(function fixZWNJProjectWide() {
    var ZWNJ = String.fromCharCode(0x200C);

    function normalizeText(t) {
        // Remove unicode directional marks that break regex on concatenated words
        // LRM/RLM, LRE/RLE/LRO/RLO/PDF, isolate marks
        t = t.replace(/[\\u200E\\u200F\\u202A-\\u202E\\u2066-\\u2069]/g, "");

        // Normalize spaces: NBSP, zero-width space, figure space → regular space
        t = t.replace(/[\\u00A0\\u200B\\u2007]/g, " ");
        // Collapse multiple spaces
        t = t.replace(/\\s{2,}/g, " ");

        // Normalize Arabic forms to Persian
        t = t.replace(/\\u064A/g, "\\u06CC"); // ي → ی
        t = t.replace(/\\u0643/g, "\\u06A9"); // ك → ک

        return t;
    }

    function applyZWNJ(t) {
        // 1) می + فعل: هر جا "می" با فاصله و بعدش حرف فارسی باشد
        // بدون تکیه بر \\b؛ آغاز یا فاصله/علائم
        t = t.replace(/(^|[\\s،؛,.!?])می\\s+(?=[\\u0600-\\u06FF])/g, function(_, p1){
            return p1 + "می" + ZWNJ;
        });

        // 2) پیوستن پسوندها: ها، تر، ترین، ای، ی/ي، گر
        // کلمه فارسی + فاصله + پسوند
        t = t.replace(/([\\u0600-\\u06FF]+)\\s+(ها|تر|ترین|ای|[یي]|گر)(?=[\\s،؛,.!?]|$)/g, function(_, word, suffix){
            // Normalize Arabic ي به ی
            if (suffix === "ي") suffix = "ی";
            // حالت ویژه: کلماتی که با «ه» تمام می‌شوند + «ای» → ه‌ای
            if (suffix === "ای" && /ه$/.test(word)) {
                return word + ZWNJ + "ای";
            }
            return word + ZWNJ + suffix;
        });

        return t;
    }

    function processTextLayer(textProp) {
        var doc = textProp.value; // TextDocument
        var original = doc.text;

        // Normalize first
        var current = normalizeText(original);

        // Apply rules until stable (Handles multiple words in one line)
        var prev, safety = 0;
        do {
            prev = current;
            current = applyZWNJ(prev);
            safety++;
        } while (current !== prev && safety < 10);

        if (current !== original) {
            doc.text = current;
            textProp.setValue(doc);
        }
    }

    var proj = app.project;
    if (!proj) return;

    app.beginUndoGroup("Fix Persian ZWNJ Across Project");

    for (var i = 1; i <= proj.numItems; i++) {
        var item = proj.item(i);
        if (item instanceof CompItem) {
            for (var L = 1; L <= item.numLayers; L++) {
                var layer = item.layer(L);
                // Text layers are AVLayer with matchName "ADBE Text Layer"
                if (layer && layer.matchName === "ADBE Text Layer") {
                    var textProp = layer.property("Source Text");
                    if (textProp) {
                        processTextLayer(textProp);
                    }
                }
            }
        }
    }

    app.endUndoGroup();
})();
`;

    const userScripts = data.join('\n');
    const finalScript = userScripts + '\n' + persianZWNJScript;
    
    fs.writeFileSync(job.scriptfile, script
        .replace('/*COMPOSITION*/', job.template.composition)
        .replace('/*USERSCRIPT*/', finalScript)
    );

    return Promise.resolve(job)
}