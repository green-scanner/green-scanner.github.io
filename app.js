import { loadCategories, matchCategory } from './category_matcher.js';
import { calculateEcoImpact } from './eco_impact.js';

const categoryDescriptions = {
    "kött": "Köttproduktion har en stor påverkan på miljön, inklusive hög vattenförbrukning och utsläpp av växthusgaser.",
    "fisk": "Fiskodling och fiske kan påverka havsmiljön och ekosystemen negativt.",
    "mejeri": "Mejeriprodukter bidrar till utsläpp av växthusgaser och kräver mycket energi och vatten.",
    "ris": "Risproduktion kräver mycket vatten och kan leda till utsläpp av metan, en potent växthusgas.",
    "ägg": "Äggproduktion har en mindre miljöpåverkan jämfört med kött, men kräver ändå resurser och energi.",
    "övrigt": "Övriga livsmedel har varierande miljöpåverkan beroende på produktion och transport."
};

// DOM Elements
let scanButton, video, loading, productInfo, comparisonContainer, guideBox, result;
let scannedBarcodes = [];
let scannedProducts = [];
let stream = null;

document.addEventListener('DOMContentLoaded', () => {
    video = document.getElementById('video');
    scanButton = document.getElementById('scanButton');
    loading = document.getElementById('loading');
    productInfo = document.getElementById('productInfo');
    comparisonContainer = document.getElementById('comparisonContainer');
    guideBox = document.querySelector('.guide-box');
    result = document.getElementById('result');

    scanButton.addEventListener('click', () => {
        if (scannedBarcodes.length < 2) {
            openCamera();
        } else {
            resetScanner();
        }
    });

    const backButton = document.querySelector('.back-button');
    if (backButton) {
        backButton.addEventListener('click', () => history.back());
    }

    const params = new URLSearchParams(window.location.search);
    const category = params.get('category');
    if (category) {
        document.getElementById('categoryMessage').textContent = `Scanna två olika produkter inom ${category}`;
        document.getElementById('categoryDescription').textContent = categoryDescriptions[category] || "";
    }
});

async function openCamera() {
    try {
        if (loading) loading.hidden = false;
        if (result) result.textContent = 'Initializing camera...';

        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "environment",
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });

        video.srcObject = stream;
        video.playsInline = true;
        await video.play();

        document.querySelector('.video-container').style.display = 'block';

        Quagga.init({
            inputStream: {
                name: "Live",
                type: "LiveStream",
                target: video,
                constraints: {
                    facingMode: "environment",
                    width: { min: 640, ideal: 1280, max: 1920 },
                    height: { min: 480, ideal: 720, max: 1080 }
                }
            },
            decoder: {
                readers: ["ean_reader", "code_128_reader", "upc_reader"]
            },
            locate: true,
            frequency: 10
        }, function (err) {
            if (err) {
                alert("Scanner initialization failed: " + err.message);
                return;
            }
            Quagga.start();
        });

        let scannedCodes = new Set();
        let isPaused = false;

        Quagga.onDetected(async (scanResult) => {
            if (isPaused) return;

            const code = scanResult.codeResult.code;

            if (!scannedCodes.has(code)) {
                scannedCodes.add(code);
                if (result) result.textContent = `Streckkod hittad: ${code} (${scannedCodes.size}/2 skannade)`;

                isPaused = true;

                await fetchProductInfo(code);

                if (scannedCodes.size === 2) {
                    result.textContent = 'Två produkter skannade – jämförelse pågår...';
                    closeCamera();
                } else {
                    setTimeout(() => {
                        isPaused = false;
                    }, 2000);
                }
            }
        });

    } catch (err) {
        alert("Could not access camera: " + err.message);
    }
}

function closeCamera() {
    document.querySelector('.video-container').style.display = 'none';
    if (stream) stream.getTracks().forEach(track => track.stop());
    if (video) video.hidden = true;
    if (guideBox) guideBox.hidden = true;
    Quagga.stop();
}

function resetScanner() {
    scannedBarcodes = [];
    scannedProducts = [];
    if (comparisonContainer) comparisonContainer.innerHTML = '';
    if (productInfo) productInfo.style.display = 'none';
}

async function fetchProductInfo(barcode) {
    try {
        if (loading) loading.hidden = false;

        const response = await fetch('https://green-scanner-github-io.onrender.com/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode })
        });

        const data = await response.json();

        if (response.ok && data.product_info) {
            await loadCategories();
            const matchedCategory = await matchCategory(data.product_info.categories.toString().toLowerCase());
            if (!matchedCategory) return;

            const ecoImpactResults = await calculateEcoImpact(data.product_info, matchedCategory);

            scannedProducts.push({
                barcode,
                name: data.product_info.name || 'No name available',
                genericName: data.product_info.generic_name || 'No generic name available',
                quantity: data.product_info.quantity || 'No quantity available',
                packaging: data.product_info.packaging || 'No packaging info',
                matchedCategory,
                labels: data.product_info.labels || 'No labels available',
                origins: data.product_info.origins || 'No origin information',
                manufacturingPlace: data.product_info.manufacturing_place || 'No manufacturing place info',
                ecoScore: data.product_info.ecoscore_grade || 'No eco-score available',
                image: data.product_info.image || '',
                totalScore: ecoImpactResults.totalScore,
                totalCo2Emission: ecoImpactResults.totalCo2Emission,
                co2EmissionPerKg: ecoImpactResults.co2EmissionPerKg,
                weightKg: ecoImpactResults.weightKg
            });

            if (scannedProducts.length === 2) {
                result.textContent = 'Två produkter har skannats! Jämförelse pågår...';
                closeCamera();
                displayComparison();
            }
        }
    } catch (err) {
        console.error('Error fetching product info:', err);
    } finally {
        if (loading) loading.hidden = true;
    }
}

function displayComparison() {
    const categoryMessage = document.getElementById('categoryMessage');
    const categoryDescription = document.getElementById('categoryDescription');
    if (categoryMessage) categoryMessage.style.display = 'none';
    if (categoryDescription) categoryDescription.style.display = 'none';

    if (productInfo) productInfo.style.display = 'block';
    if (comparisonContainer) comparisonContainer.innerHTML = '';

    const minScore = Math.min(...scannedProducts.map(p => p.totalScore));
    const maxScore = Math.max(...scannedProducts.map(p => p.totalScore));

    scannedProducts.forEach(product => {
        const productCard = document.createElement('div');
        productCard.classList.add('product-card');

        if (product.totalScore === minScore) {
            productCard.classList.add('low-impact');
        } else if (product.totalScore === maxScore) {
            productCard.classList.add('high-impact');
        }

        productCard.innerHTML = `
            <p><strong>Name:</strong> ${product.name}</p>
            <p><strong>Matched category:</strong> ${product.matchedCategory}</p>
            <p><strong>Quantity:</strong> ${product.quantity}</p>
            <p><strong>Origins:</strong> ${product.origins}</p>
            <p><strong>Eco-Impact Score:</strong> ${product.totalScore.toFixed(2)}</p>
            <p><strong>Total CO2 Emission:</strong> ${product.totalCo2Emission.toFixed(2)} kg CO₂e</p>
            <p><strong>CO2 Emission Per Kg:</strong> ${product.co2EmissionPerKg.toFixed(2)} kg CO₂e</p>
            <img src="${product.image}" alt="Product Image">
        `;

        comparisonContainer.appendChild(productCard);
    });
}
