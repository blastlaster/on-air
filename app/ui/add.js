'use strict';
const $ = (id) => document.getElementById(id);
const app = window.onairApp;

async function show() {
    const s = await app.stations();
    const list = (s && s.list) || [];
    $('saved').hidden = !list.length;
    $('back').hidden = !list.length;
    $('addTitle').textContent = list.length ? 'Add another station' : 'Add a station';
    $('list').innerHTML = '';
    list.forEach((st, i) => {
        const li = document.createElement('li');
        if (i === s.current) li.className = 'current';
        const pick = document.createElement('button');
        pick.type = 'button'; pick.className = 'pick';
        pick.innerHTML = '<img alt=""><span class="txt"><b></b><span></span></span>';
        pick.querySelector('img').src = st.icon;
        pick.querySelector('b').textContent = st.name;
        pick.querySelector('.txt span').textContent = st.pageUrl.replace(/^https?:\/\//, '');
        pick.onclick = () => app.pickStation(i);
        const del = document.createElement('button');
        del.type = 'button'; del.className = 'del'; del.title = 'Remove'; del.textContent = '✕';
        del.onclick = async () => { await app.removeStation(i); show(); };
        const ic = document.createElement('button');
        ic.type = 'button'; ic.className = 'small'; ic.textContent = 'Icon…';
        ic.title = 'Use your own picture as this station’s icon';
        ic.onclick = async () => {
            try { if (await app.setIcon(i)) show(); }
            catch (err) { alert(String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); }
        };
        const reset = document.createElement('button');
        reset.type = 'button'; reset.className = 'small'; reset.textContent = 'Reset';
        reset.title = 'Use the icon the station’s page offers';
        reset.hidden = !st.custom;
        reset.onclick = async () => { await app.resetIcon(i); show(); };
        li.append(pick, ic, reset, del);
        $('list').append(li);
    });
}

$('add').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('go');
    btn.disabled = true; btn.textContent = 'Looking…'; $('err').hidden = true;
    try {
        await app.addStation($('url').value);
    } catch (err) {
        // Electron prefixes errors from the app side; show only the message.
        $('err').textContent = String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
        $('err').hidden = false;
        btn.disabled = false; btn.textContent = 'Add';
    }
};
$('back').onclick = () => app.back();
show();
$('url').focus();
