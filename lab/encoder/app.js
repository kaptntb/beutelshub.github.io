(() => {

const $ = id => document.getElementById(id);

const input = $("input");
const output = $("output");
const status = $("status");

const btnEncode = $("btn-encode");
const btnDecode = $("btn-decode");
const btnClear = $("btn-clear");

const btnCopyIn = $("btn-copy-in");
const btnCopyOut = $("btn-copy-out");

let mode = "base64";


// mode buttons
document.querySelectorAll("[data-mode]").forEach(btn => {

    btn.onclick = () => {

        document.querySelectorAll("[data-mode]")
        .forEach(b => b.classList.remove("active"));

        btn.classList.add("active");

        mode = btn.dataset.mode;

        status.textContent = mode.toUpperCase();

    };

});


// encode
btnEncode.onclick = async () => {

    try{

        const text = input.value;

        if(mode === "base64")
            output.value = btoa(unescape(encodeURIComponent(text)));

        if(mode === "url")
            output.value = encodeURIComponent(text);

        if(mode === "sha256")
            output.value = await sha256(text);

        status.textContent = "ENCODED";

    }catch(e){

        status.textContent = "ERROR";

    }

};


// decode
btnDecode.onclick = () => {

    try{

        const text = input.value;

        if(mode === "base64")
            output.value = decodeURIComponent(escape(atob(text)));

        if(mode === "url")
            output.value = decodeURIComponent(text);

        if(mode === "sha256")
            output.value = "Hash kann nicht decodiert werden";

        status.textContent = "DECODED";

    }catch(e){

        status.textContent = "ERROR";

    }

};


// clear
btnClear.onclick = () => {

    input.value = "";
    output.value = "";

};


// copy
btnCopyIn.onclick = () => copy(input.value);
btnCopyOut.onclick = () => copy(output.value);


async function copy(text){

    try{

        await navigator.clipboard.writeText(text);
        status.textContent = "COPIED";

    }catch{

        status.textContent = "COPY FAILED";

    }

}


// SHA256
async function sha256(text){

    const buf = new TextEncoder().encode(text);

    const hash = await crypto.subtle.digest("SHA-256", buf);

    return [...new Uint8Array(hash)]
    .map(b => b.toString(16).padStart(2,"0"))
    .join("");

}


})();
