const newPawIcon = `<svg class=\"btn-paw-icon\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\"><path d=\"M12.0001 19.5C14.2092 19.5 16.0001 17.7091 16.0001 15.5C16.0001 13.2909 14.2092 11.5 12.0001 11.5C9.79098 11.5 8.00006 13.2909 8.00006 15.5C8.00006 17.7091 9.79098 19.5 12.0001 19.5Z\" stroke=\"var(--brand-orange)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M8.5 8C9.32843 8 10 7.32843 10 6.5C10 5.67157 9.32843 5 8.5 5C7.67157 5 7 5.67157 7 6.5C7 7.32843 7.67157 8 8.5 8Z\" fill=\"var(--brand-orange)\"/><path d=\"M15.5 8C16.3284 8 17 7.32843 17 6.5C17 5.67157 16.3284 5 15.5 5C14.6716 5 14 5.67157 14 6.5C14 7.32843 14.6716 8 15.5 8Z\" fill=\"var(--brand-orange)\"/><path d=\"M5.5 12C6.32843 12 7 11.3284 7 10.5C7 9.67157 6.32843 9 5.5 9C4.67157 9 4 9.67157 4 10.5C4 11.3284 4.67157 12 5.5 12Z\" fill=\"var(--brand-orange)\"/><path d=\"M18.5 12C19.3284 12 20 11.3284 20 10.5C20 9.67157 19.3284 9 18.5 9C17.6716 9 17 9.67157 17 10.5C17 11.3284 17.6716 12 18.5 12Z\" fill=\"var(--brand-orange)\"/></svg>`;

let storesData = [];
const sheetUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRxrwy4EBjdHPkLHaSBt-fN7OC12iuAecz8N76kHM3CP1qpEL9TbVpLbYKu_ICYrlocn2m2SbURuN1Z/pub?output=csv';

let userHasUsedLocation = localStorage.getItem('locationUsed') === 'true';
let lastKnownLocation = localStorage.getItem('lastKnownLocation');

function resetLocationState() {
    localStorage.removeItem('locationUsed');
    localStorage.removeItem('lastKnownLocation');
    userHasUsedLocation = false;

    document.getElementById('header-loc-text').innerText = 'Set Location';
	const gpsIcon = document.getElementById('header-gps-icon');
	if(gpsIcon) {
		gpsIcon.style.color = 'var(--text-gray-muted)';
		gpsIcon.parentElement.querySelector('#header-loc-text').style.color = 'var(--text-gray-muted)';
	}

    const locationBar = document.querySelector('.location-bar');
	const icon = document.getElementById('header-gps-icon');
	if (locationBar && icon) {
		const iconRect = icon.getBoundingClientRect();
		locationBar.style.transformOrigin = `${iconRect.left + iconRect.width / 2}px 0px`;
	}
	locationBar.classList.remove('hidden');
    document.getElementById('nearest-slider-container').style.display = 'none';

    if (storesData.length > 0) {
        storesData.forEach(store => store.distance = "Calculating...");
        renderFeed();
    }

    document.getElementById('status-text').innerText = "Please enable location for accurate distances.";
}

function listenForLocationChanges() {
    setInterval(async () => {
        if (!navigator.permissions) return;
        try {
            const permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
            if (permissionStatus.state === 'granted') {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const locationBar = document.querySelector('.location-bar');
                        if (!locationBar.classList.contains('hidden')) {
                             processLocation(position);
                        }
                    },
                    (error) => {
                        const locationBar = document.querySelector('.location-bar');
                        if (locationBar.classList.contains('hidden') && (error.code === 1 || error.code === 2)) {
                           resetLocationState();
                        }
                    }
                );
            } else if (permissionStatus.state === 'denied') {
                if (localStorage.getItem('locationUsed') === 'true') {
                    resetLocationState();
                }
            }
        } catch (e) {
            // console.error("Error checking location permission:", e);
        }
    }, 3000);
}

async function initApp() {
    listenForLocationChanges();
    document.getElementById('header-loc-text').innerText = lastKnownLocation || 'Set Location';

    if (lastKnownLocation) {
        const gpsIcon = document.getElementById('header-gps-icon');
        if (gpsIcon) {
            gpsIcon.style.color = 'var(--brand-orange)';
            gpsIcon.parentElement.querySelector('#header-loc-text').style.color = 'var(--text-white-crisp)';
        }
    }

    await loadRealData();

    if (userHasUsedLocation) {
        try {
            const permission = await navigator.permissions.query({ name: 'geolocation' });
            if (permission.state === 'granted') {
                getUserLocation();
            } else {
                resetLocationState();
            }
        } catch(e) {
            getUserLocation();
        }
    }
}

async function loadRealData(coords) {
    try {
        document.getElementById('status-text').innerText = "Syncing Live Database...";
        const response = await fetch(sheetUrl);
        const csvText = await response.text();
        storesData = csvToJson(csvText);
        
        if (coords) {
            storesData.forEach(store => {
                store.distance = calculateDistance(coords.latitude, coords.longitude, store.lat, store.lng).toFixed(1);
            });
            storesData.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
        } else {
            storesData.forEach(store => store.distance = "Calculating...");
        }

        renderFeed();

        if (!coords) {
            document.getElementById('status-text').innerText = "Please enable location for accurate distances.";
        }

    } catch (error) {
        console.error("Error loading Live Database:", error);
        document.getElementById('status-text').innerText = "Database connection failed.";
    }
}

function csvToJson(csv) {
    const lines = csv.split(/\r?\n/);
    const result = [];
    const headers = lines[0].split(",").map(h => h.trim());

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        let obj = {};
        let currentline = [];
        let inQuotes = false;
        let val = '';

        for (let char of lines[i]) {
            if (char === '"' && inQuotes) {
                inQuotes = false;
            } else if (char === '"' && !inQuotes) {
                inQuotes = true;
            } else if (char === ',' && !inQuotes) {
                currentline.push(val.trim());
                val = '';
            } else {
                val += char;
            }
        }
        currentline.push(val.trim());

        for (let j = 0; j < headers.length; j++) {
            if (headers[j]) {
                 let value = currentline[j] || '';
                 if (value.startsWith('"') && value.endsWith('"')) {
                     value = value.slice(1, -1);
                 }
                 obj[headers[j]] = value;
            }
        }
        result.push(obj);
    }
    return result;
}

const feedView = document.getElementById('feed-view');

function renderFeed() {
    feedView.innerHTML = '';
    storesData.forEach(store => {
        const distanceTag = store.distance && store.distance !== "Calculating..."
            ? `<span class=\"distance-tag\">${store.distance} km away</span>`
            : '';
        
        const ratingAndReviews = `
            <div class=\"rating-info\">
                <span class=\"star\">⭐</span>
                <span class=\"rating-number\">${store.rating || '4.8'}</span>
                <span class=\"reviews\">(${store.reviews || '150+ Reviews'})</span>
            </div>
        `;

        feedView.innerHTML += `
            <article class=\"store-card\" data-store-id=\"${store.id}\" onclick=\"openDetails('${store.id}')\">
                <img src=\"${store.cover || ''}\" alt=\"${store.name}\" class=\"card-image\" onerror=\"this.style.background='#2a3f7a'\">
                <div class=\"card-content\">
                    <h3 class=\"store-title\">${store.name}</h3>
                    ${ratingAndReviews}
                    <p class=\"store-address\">
                        <svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 20 20\" fill=\"currentColor\" width=\"16\" height=\"16\">
                          <path fill-rule=\"evenodd\" d=\"M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z\" clip-rule=\"evenodd\" />
                        </svg>
                        <span>${store.address}</span>
                    </p>
                    ${distanceTag}
                    <button class=\"view-btn\">View Details</button>
                </div>
            </article>
        `;
    });
}

function getUserLocation() {
    const locateBtn = document.querySelector('.locate-btn');
    const btnText = document.getElementById('locate-btn-text');

    locateBtn.classList.add('detecting');
    btnText.innerHTML = 'Detecting...<br>&nbsp;';
    document.getElementById('status-text').innerText = "Finding your location...";

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(processLocation, (error) => {
            showError(error);
            locateBtn.classList.remove('detecting');
            btnText.innerHTML = 'Detect My<br>Location';
        });
    } else {
        document.getElementById('status-text').innerText = "GPS not supported by your browser.";
        locateBtn.classList.remove('detecting');
        btnText.innerHTML = 'Detect My<br>Location';
    }
}

async function processLocation(position) {
    const locateBtn = document.querySelector('.locate-btn');
    const btnText = document.getElementById('locate-btn-text');
    localStorage.setItem('locationUsed', 'true');
    userHasUsedLocation = true;

    document.getElementById('status-text').innerText = "Location Detected. Updating list...";
    await loadRealData(position.coords);

    const nearestSliderContainer = document.getElementById('nearest-slider-container');
    const nearestSlider = document.getElementById('nearest-slider');
    if (storesData.length > 0 && nearestSlider) {
        const nearestStores = storesData.slice(0, 5);
        nearestSlider.innerHTML = nearestStores.map(store => {
            return `
            <div class=\"nearest-card\" onclick=\"openDetails('${store.id}')\">
                <img src=\"${store.cover || ''}\" style=\"width: 100%; height: 120px; object-fit: cover;\" onerror=\"this.style.display='none'\">
                <div class=\"card-info-top\">
                    <h4>${store.name}</h4>
                     <div class=\"top-card-rating\"><svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"#FFD700\"><path d=\"M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z\"/></svg> ${store.rating || '4.5'}</div>
                    <div class=\"top-card-address\">
                        <svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"#d0d0d0\"><path d=\"M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5-2.5z\"/></svg>
                        <span class=\"top-card-address-text\" title=\"${store.address}\">${store.address}</span>
                    </div>
                    <div class=\"top-card-distance-badge\">${store.distance} km away</div>
                </div>
                <button class=\"slider-view-btn\">View Details</button>
            </div>
        `}).join('');

        nearestSliderContainer.style.display = 'block';
        setTimeout(() => {
            nearestSliderContainer.style.opacity = '1';
        }, 10);
    }

    try {
        const geoResponse = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.coords.latitude}&lon=${position.coords.longitude}`);
        const geoData = await geoResponse.json();
        const city = geoData.address.city || geoData.address.town || geoData.address.village || 'Location Detected';
        lastKnownLocation = city;
        localStorage.setItem('lastKnownLocation', city);
        document.getElementById('header-loc-text').innerText = city;
		const gpsIcon = document.getElementById('header-gps-icon');
		if (gpsIcon) {
			gpsIcon.style.color = 'var(--brand-orange)';
			gpsIcon.parentElement.querySelector('#header-loc-text').style.color = 'var(--text-white-crisp)';
		}
    } catch (e) {
        console.error("Reverse geocoding failed", e);
        document.getElementById('header-loc-text').innerText = "Location Detected";
    }

    const locationBar = document.querySelector('.location-bar');
	const icon = document.getElementById('header-gps-icon');
	if (locationBar && icon) {
		const iconRect = icon.getBoundingClientRect();
		const barRect = locationBar.getBoundingClientRect();
		const originX = ((iconRect.left + iconRect.width / 2) - barRect.left) / barRect.width * 100;
		locationBar.style.transformOrigin = `${originX}% 0%`;
	}
	locationBar.classList.add('hidden');
    document.getElementById('status-text').innerText = "Showing nearest centers.";
    locateBtn.classList.remove('detecting');
    btnText.innerHTML = 'Detect My<br>Location';
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; 
}

function showError(error) {
    let message;
    switch(error.code) {
        case error.PERMISSION_DENIED:
            resetLocationState();
            return;
        case error.POSITION_UNAVAILABLE: message = "Location information is unavailable."; break;
        case error.TIMEOUT: message = "The request to get user location timed out."; break;
        default: message = "An error occurred with location services.";
    }
    document.getElementById('status-text').innerText = message;
    console.error(error);
}

function openDetails(storeId) {
    if (document.getElementById('search-overlay').classList.contains('active')) {
        history.back();
    }
    const store = storesData.find(s => s.id === storeId);
    if (!store) return;
    const detailContent = document.getElementById('detail-content');
    const images = (store.image || '').split(',').map(s => s.trim()).filter(Boolean);
    const videoUrl = (store.video || '').trim();
    let sliderHtml = '';

    if (videoUrl) {
        sliderHtml += `
            <div class=\"slider-item\">
                <video controls controlsList=\"nodownload\" poster=\"${images[0] || ''}\"><source src=\"${videoUrl}\" type=\"video/mp4\"></video>
            </div>`;
    }
    images.forEach(img => {
        sliderHtml += `<div class=\"slider-item\"><img src=\"${img}\" alt=\"${store.name}\"></div>`;
    });

    const ratingAndReviews = `<div class=\"rating\" style=\"color: var(--text-white-crisp); font-size: 1rem; margin-bottom: 15px;\">⭐ ${store.rating || '4.5'} <span class=\"reviews\">(${store.reviews || 'New'})</span></div>`;

    detailContent.innerHTML = `
        <div class=\"multimedia-slider-container\">
            <button class=\"nav-btn prev-btn\" id=\"goPrev\">&#10094;</button>
            <div class=\"image-slider\" id=\"mainSlider\">${sliderHtml}</div>
            <button class=\"nav-btn next-btn\" id=\"goNext\">&#10095;</button>
        </div>
        <div style=\"padding: 15px;\">
            <h1 style=\"font-size: 1.8rem; margin: 0; margin-bottom: 5px;\">${store.name}</h1>
            ${ratingAndReviews}
            <p style=\"color: var(--text-gray-muted); margin-bottom: 15px; display: flex; align-items: flex-start; gap: 6px;\">
                 <svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 20 20\" fill=\"currentColor\" width=\"16\" height=\"16\" style=\"flex-shrink: 0; margin-top: 2px;\">
                  <path fill-rule=\"evenodd\" d=\"M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z\" clip-rule=\"evenodd\" />
                </svg>
                <span>${store.address}</span>
            </p>
            <h3>About Clinic</h3>
            <p class=\"about-text\" style=\"line-height: 1.6; color: var(--text-white-crisp); font-size: 0.95rem; margin-bottom: 30px;\">${store.about || 'Premium care for your beloved pets.'}</p>
            <button class=\"book-btn\" onclick=\"openBookingModal('${store.id}')\">Book Appointment ${newPawIcon}</button>
        </div>
    `;

    const slider = document.getElementById('mainSlider');
    const prevBtn = document.getElementById('goPrev');
    const nextBtn = document.getElementById('goNext');
    function updateArrows() {
        if (!slider) return;
        prevBtn.style.display = (slider.scrollLeft <= 5) ? 'none' : 'flex';
        nextBtn.style.display = (slider.scrollLeft + slider.clientWidth >= slider.scrollWidth - 5) ? 'none' : 'flex';
    }
    slider.addEventListener('scroll', updateArrows);
    setTimeout(updateArrows, 150);
    nextBtn.onclick = () => slider.scrollBy({ left: slider.clientWidth, behavior: 'smooth' });
    prevBtn.onclick = () => slider.scrollBy({ left: -slider.clientWidth, behavior: 'smooth' });

    document.getElementById('sheet-overlay').classList.add('active');
    document.getElementById('bottom-sheet').classList.add('active');
    document.body.style.overflow = 'hidden'; 
    history.pushState({detailsOpen: true}, '', `#details-${store.id}`);
}

function closeDetails() {
    document.getElementById('bottom-sheet').classList.remove('active');
    document.getElementById('sheet-overlay').classList.remove('active');
    if(!document.getElementById('booking-modal').classList.contains('active')) {
        document.body.style.overflow = '';
    }
}

let lastScrollTop = 0;
const bottomNav = document.getElementById('bottom-nav');
window.addEventListener("scroll", function(){
    let st = window.pageYOffset || document.documentElement.scrollTop; 
    if (st > lastScrollTop && st > 50){
        bottomNav.classList.add('hidden');
    } else {
        bottomNav.classList.remove('hidden');
    }
    lastScrollTop = st <= 0 ? 0 : st; 
}, false);

function openBookingModal(storeId) {
    const store = storesData.find(s => s.id === storeId);
    if (!store) return;

    if(document.getElementById('bottom-sheet').classList.contains('active')) {
        closeDetails();
    }

    setTimeout(() => {
        const bookingModal = document.getElementById('booking-modal');
        const bookingOverlay = document.getElementById('booking-overlay');

        bookingModal.classList.add('active');
        if (bookingOverlay) bookingOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }, 300);
}

function closeBookingModal() {
    const bookingModal = document.getElementById('booking-modal');
    const bookingOverlay = document.getElementById('booking-overlay');

    if (bookingModal) bookingModal.classList.remove('active');
    if (bookingOverlay) bookingOverlay.classList.remove('active');

    const detailsSheet = document.getElementById('bottom-sheet');
    if (!detailsSheet.classList.contains('active')) {
         document.body.style.overflow = '';
    }
}

function openAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) {
        modal.style.display = 'flex';
        history.pushState({ authModalOpen: true }, '', '#login');
        document.body.style.overflow = 'hidden';
        setTimeout(() => {
            modal.style.opacity = '1';
        }, 10);
    }
}

function closeAuthModal(fromPopState = false) {
    const modal = document.getElementById('auth-modal');
    if (modal && modal.style.display === 'flex') {
        modal.style.opacity = '0';
        
        const sheet = document.getElementById('bottom-sheet');
        if (!sheet.classList.contains('active')) {
            document.body.style.overflow = '';
        }

        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);

        if (!fromPopState && history.state && history.state.authModalOpen) {
            history.back();
        }
    }
}

initApp();

const searchInput = document.getElementById('animated-search');
const placeholderContainer = document.getElementById('rolling-placeholder-container');
const textWrapper = document.getElementById('rolling-text-wrapper');
if (searchInput && placeholderContainer && textWrapper) {
    const placeholderItems = textWrapper.querySelectorAll('span');
    const itemHeight = 20; 
    let currentIndex = 0;
    let rollInterval;

    const startRolling = () => {
        if(rollInterval) clearInterval(rollInterval);
        rollInterval = setInterval(() => {
            currentIndex++;
            textWrapper.style.top = `-${currentIndex * itemHeight}px`;
            if (currentIndex >= placeholderItems.length - 1) {
                setTimeout(() => {
                    textWrapper.style.transition = 'none';
                    currentIndex = 0;
                    textWrapper.style.top = '0px';
                    void textWrapper.offsetWidth; 
                    textWrapper.style.transition = 'top 0.6s cubic-bezier(0.77, 0, 0.175, 1)';
                }, 700);
            }
        }, 2500);
    };

    const stopRolling = () => {
        clearInterval(rollInterval);
    };

    searchInput.addEventListener('focus', () => {
        placeholderContainer.classList.add('hidden');
        stopRolling();
    });

    searchInput.addEventListener('blur', () => {
        if (searchInput.value.trim() === '') {
            placeholderContainer.classList.remove('hidden');
            startRolling();
        }
    });

    searchInput.addEventListener('input', () => {
        if (searchInput.value.trim() !== '') {
            placeholderContainer.classList.add('hidden');
            stopRolling();
        } else {
            if (document.activeElement !== searchInput) {
                placeholderContainer.classList.remove('hidden');
                startRolling();
            }
        }
    });

    startRolling();
}

document.addEventListener('DOMContentLoaded', () => { 
    const mainSearchBarContainer = document.querySelector('.premium-search-container');
    const searchOverlay = document.getElementById('search-overlay');
    const activeSearchInput = document.getElementById('active-search');
    const backButton = searchOverlay.querySelector('.back-icon');
    const trendingSearches = document.getElementById('trending-searches');
    const searchResultsContainer = document.getElementById('search-results');
    const voiceSearchBtn = document.getElementById('voice-search-btn');
    const navSearchBtn = document.getElementById('nav-search-btn');

    // --- New Booking Modal Slider Logic ---
    const bookingModal = document.getElementById('booking-modal');
    const sliderTrack = bookingModal.querySelector('.form-slider-track');
    const nextBtns = bookingModal.querySelectorAll('.slider-nav-btn.next');
    const backBtns = bookingModal.querySelectorAll('.slider-nav-btn.back');
    const closeBookingBtn = document.getElementById('close-booking-modal');
    const bookingOverlay = document.getElementById('booking-overlay');
    let currentStep = 0;

    function updateSlider() {
        sliderTrack.style.transform = `translateX(-${currentStep * (100 / 3)}%)`;
    }

    nextBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (currentStep < 2) {
                currentStep++;
                updateSlider();
            }
        });
    });

    backBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (currentStep > 0) {
                currentStep--;
                updateSlider();
            }
        });
    });

    if(closeBookingBtn) closeBookingBtn.addEventListener('click', closeBookingModal);
    if(bookingOverlay) bookingOverlay.addEventListener('click', closeBookingModal);

    const clinicToggle = document.getElementById('clinic-toggle');
    const homeToggle = document.getElementById('home-toggle');
    const homeAddressContainer = document.getElementById('home-address-container');

    if(clinicToggle) {
        clinicToggle.addEventListener('click', () => {
            clinicToggle.classList.add('active');
            homeToggle.classList.remove('active');
            homeAddressContainer.style.display = 'none';
        });
    }
    if(homeToggle) {
        homeToggle.addEventListener('click', () => {
            homeToggle.classList.add('active');
            clinicToggle.classList.remove('active');
            homeAddressContainer.style.display = 'block';
        });
    }


    const nearestSlider = document.getElementById('nearest-slider');
    if (nearestSlider) {
        const sliderWrapper = nearestSlider.parentElement;
        const leftBtn = sliderWrapper.querySelector('.slide-btn.left');
        const rightBtn = sliderWrapper.querySelector('.slide-btn.right');
        leftBtn.addEventListener('click', () => {
            nearestSlider.scrollBy({ left: -266, behavior: 'smooth' });
        });
        rightBtn.addEventListener('click', () => {
            nearestSlider.scrollBy({ left: 266, behavior: 'smooth' });
        });
    }

    function openSearch() {
        if (searchOverlay.classList.contains('active')) return;
        document.body.style.overflow = 'hidden';
        history.pushState({ searchOpen: true }, '', '#search');
        searchOverlay.classList.add('active');
        setTimeout(() => activeSearchInput.focus({ preventScroll: true }), 400); 
    }

    function closeSearch() {
        document.body.style.overflow = '';
        searchOverlay.classList.remove('active');
        activeSearchInput.value = '';
        activeSearchInput.dispatchEvent(new Event('input'));
    }

    window.addEventListener('popstate', function(event) { 
        const authModal = document.getElementById('auth-modal'); 
        if (authModal && authModal.style.display === 'flex') { 
            event.stopImmediatePropagation();
            closeAuthModal(true); 
        } 
    }, true);

    window.addEventListener('popstate', (event) => {
        if (searchOverlay.classList.contains('active')) {
            closeSearch();
        } else if (document.getElementById('bottom-sheet').classList.contains('active')) {
            closeDetails();
        }
    });


    if (mainSearchBarContainer && searchOverlay && activeSearchInput && backButton && trendingSearches && searchResultsContainer) {
        mainSearchBarContainer.addEventListener('click', openSearch);
        if (navSearchBtn) {
            navSearchBtn.addEventListener('click', (event) => {
                event.preventDefault();
                openSearch();
            });
        }
        backButton.addEventListener('click', () => history.back());

        activeSearchInput.addEventListener('input', () => {
            const query = activeSearchInput.value.trim();

            if (query === '') {
                trendingSearches.style.display = 'block';
                searchResultsContainer.style.display = 'none';
                searchResultsContainer.innerHTML = '';
                return;
            }

            trendingSearches.style.display = 'none';
            searchResultsContainer.style.display = 'block';

            const searchWords = query.toLowerCase().split(' ').filter(w => w !== '');
            const filteredStores = storesData.filter(store => {
                const storeNameLower = store.name.toLowerCase();
                return searchWords.every(word => storeNameLower.includes(word));
            });

            let resultsHtml = '';
            if (filteredStores.length > 0) {
                filteredStores.forEach(store => {
                    const regex = new RegExp(`(${searchWords.join('|')})`, 'gi');
                    const highlightedName = store.name.replace(regex, '<span class=\"highlight\">$1</span>');

                    resultsHtml += `
                        <div class=\"micro-card\" data-store-id=\"${store.id}\">
                            <img src=\"${store.cover || ''}\" alt=\"${store.name}\" onerror=\"this.style.background='#2a3f7a'\">
                            <div class=\"micro-card-info\">
                                <h4>${highlightedName}</h4>
                                <p>${store.address || 'Address not available'}</p>
                            </div>
                            <a class=\"micro-card-action\">View</a>
                        </div>
                    `;
                });
            } else {
                resultsHtml = '<p style=\"padding: 20px 5px;\">No clinics found matching your search.</p>';
            }
            searchResultsContainer.innerHTML = resultsHtml;
        });

        searchResultsContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.micro-card');
            if (card) {
                const storeId = card.dataset.storeId;
                if (storeId) {
                    if (e.target.classList.contains('micro-card-action')) {
                        history.back(); 
                        setTimeout(() => {
                            const targetCard = document.querySelector(`.store-card[data-store-id=\"${storeId}\"]`);
                            if (targetCard) {
                                targetCard.scrollIntoView({
                                    behavior: 'smooth',
                                    block: 'center'
                                });
                            }
                        }, 450); 
                    } else {
                        openDetails(storeId);
                    }
                }
            }
        });

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition && voiceSearchBtn) {
            const recognition = new SpeechRecognition();
            recognition.lang = 'en-US';
            const originalPlaceholder = activeSearchInput.placeholder;
            let isListening = false;
            let micTimeout;

            recognition.onstart = () => {
                isListening = true;
                voiceSearchBtn.classList.add('listening');
                activeSearchInput.placeholder = 'Listening... 🎤';
                micTimeout = setTimeout(() => {
                    if (isListening) {
                        recognition.stop();
                    }
                }, 5000);
            };

            recognition.onend = () => {
                clearTimeout(micTimeout);
                isListening = false;
                voiceSearchBtn.classList.remove('listening');
                activeSearchInput.placeholder = originalPlaceholder;
            };

            recognition.onresult = (event) => {
                clearTimeout(micTimeout);
                isListening = false;

                const transcript = event.results[0][0].transcript;
                activeSearchInput.value = transcript;
                activeSearchInput.dispatchEvent(new Event('input'));
            };

            voiceSearchBtn.addEventListener('click', () => {
                if (isListening) {
                    recognition.stop();
                } else {
                    try {
                        recognition.start();
                    } catch (e) {
                        console.error("Voice recognition could not be started.", e);
                    }
                }
            });

            recognition.onerror = (event) => {
                clearTimeout(micTimeout);
                isListening = false;
                voiceSearchBtn.classList.remove('listening');
                activeSearchInput.placeholder = originalPlaceholder;
                console.error("Speech recognition error:", event.error);
            }
        } else if (voiceSearchBtn) {
            voiceSearchBtn.style.display = 'none';
        }
    }
});

const bottomSheet = document.getElementById('bottom-sheet');
const sheetOverlay = document.getElementById('sheet-overlay');

if (bottomSheet) {
    let touchStartY = 0;

    bottomSheet.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
        bottomSheet.style.transition = 'none';
    });

    bottomSheet.addEventListener('touchmove', (e) => {
        const touchCurrentY = e.touches[0].clientY;
        const deltaY = touchCurrentY - touchStartY;
        if (deltaY > 0) {
            bottomSheet.style.transform = `translateY(${deltaY}px)`;
        }
    });

    bottomSheet.addEventListener('touchend', (e) => {
        const touchEndY = e.changedTouches[0].clientY;
        const deltaY = touchEndY - touchStartY;
        bottomSheet.style.transition = 'transform 0.3s ease';

        if (deltaY > 150) {
            bottomSheet.classList.remove('active');
            if (sheetOverlay) {
                sheetOverlay.classList.remove('active');
            }
            document.body.style.overflow = '';
            setTimeout(() => {
                bottomSheet.style.transform = '';
            }, 300);
        } else {
            bottomSheet.style.transform = 'translateY(0)';
        }
    });
}
function slideBookingForm(stepIndex) {
    const track = document.getElementById('form-slider-track');
    track.style.transform = `translateX(-${stepIndex * 33.333}%)`;
}
function openPremiumBookingModal(clinicName) {
    const nameElement = document.getElementById('sheet-clinic-name');
    if(nameElement) {
       nameElement.innerHTML = clinicName + ' <span class=\"rating\"><svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"#FFD700\"><path d=\"M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z\"/></svg> 4.8</span>';
    }
    document.getElementById('booking-bottom-sheet').classList.add('show');
    document.getElementById('booking-overlay').style.display = 'block';
    slideBookingForm(0); 
}
document.getElementById('close-sheet-btn').addEventListener('click', function() {
    document.getElementById('booking-bottom-sheet').classList.remove('show');
    document.getElementById('booking-overlay').style.display = 'none';
});
document.getElementById('booking-overlay').addEventListener('click', function() {
    document.getElementById('booking-bottom-sheet').classList.remove('show');
    document.getElementById('booking-overlay').style.display = 'none';
});
