// Minimal Letterboxd scraper (client‑side only)
const status = document.getElementById('status');
const list   = document.getElementById('filmList');
const btn    = document.getElementById('fetchBtn');

btn.addEventListener('click', () => {
    const user = document.getElementById('username').value.trim();
    if (!user){
        status.textContent = 'Please enter a username.'; 
        return;
    }
    fetchAllFilms(user);
});

async function fetchAllFilms(username){
    list.innerHTML = '';
    status.textContent = 'Fetching… (this may take a moment for big collections)';
    const films = new Map();               // "Title (Year)" → year

    const proxy = 'https://api.allorigins.win/raw?url=';
    let page = 1;
    try{
        while(true){
            const path = page === 1
                ? `https://letterboxd.com/${username}/films/`
                : `https://letterboxd.com/${username}/films/page/${page}/`;
            const resp = await fetch(proxy + encodeURIComponent(path));
            if(!resp.ok) throw new Error('Profile not found or blocked by CORS');
            const htmlText = await resp.text();
            const countThisPage = extractFilms(htmlText, films);
            if(countThisPage === 0) break;   // reached the end
            page++;
        }

        if(films.size === 0){
            status.textContent = 'No films found or profile is private.';
            return;
        }

        const titles = Array.from(films.keys()).sort((a,b) => a.localeCompare(b));
        const frag = document.createDocumentFragment();
        titles.forEach(t => {
            const li = document.createElement('li');
            li.textContent = t;
            frag.appendChild(li);
        });
        list.appendChild(frag);
        status.textContent = `Found ${films.size} unique films.`;
    }catch(err){
        status.textContent = 'Error: ' + err.message;
    }
}

// Parse one Letterboxd films page HTML and populate Map
function extractFilms(htmlText, map){
    const doc = new DOMParser().parseFromString(htmlText, 'text/html');
    const items = doc.querySelectorAll('li.poster-container');
    let added = 0;
    items.forEach(li => {
        const title = li.getAttribute('data-film-name');
        const year  = li.getAttribute('data-film-release-year') || li.getAttribute('data-film-year');
        if(title && year){
            const key = `${title} (${year})`;
            if(!map.has(key)){
                map.set(key, year);
                added++;
            }
        }
    });
    return added;
}
