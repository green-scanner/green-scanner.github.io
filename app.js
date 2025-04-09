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

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    

    // Initialize other elements
    video = document.getElementById('video');
    scanButton = document.getElementById('scanButton');
    loading = document.getElementById('loading');
    productInfo = document.getElementById('productInfo');
    comparisonContainer = document.getElementById('comparisonContainer');
    guideBox = document.querySelector('.guide-box');
    result = document.getElementById('result');

    

    console.log("Other elements initialized");

    // Attach Event Listener to Scan Button
    scanButton.addEventListener('click', () => {
        console.log('Scan button clicked');
        if (scannedBarcodes.length < 2) {
            openCamera();
        } else {
            resetScanner();
        }
    });

    // Attach Event Listener to Back Button
    const backButton = document.querySelector('.back-button');
    if (backButton) {
        backButton.addEventListener('click', () => {
            console.log('Back button clicked');
            history.back();
        });
    }

    // Load any initial data
    const params = new URLSearchParams(window.location.search);
    const category = params.get('category');
    if (category) {
        document.getElementById('categoryMessage').textContent = `Scanna två olika produkter inom ${category}`;
        document.getElementById('categoryDescription').textContent = categoryDescriptions[category] || "";
    }
});



// Initialize Quagga for scanning
async function openCamera() {
    console.log('openCamera() called');
    try {
        if (loading) loading.hidden = false;
        if (result) result.textContent = 'Initializing camera...';

        console.log('Requesting user media...');
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "environment",
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });

        console.log('User media obtained:', stream);
        video.srcObject = stream;
        video.playsInline = true;
        
        await video.play();

   
        
        console.log('Video playing, initializing Quagga...');
        document.querySelector('.video-container').style.display = 'block';

        // Now initialize Quagga
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
                console.error("Quagga init error:", err);
                alert("Scanner initialization failed: " + err.message);
                return;
            }
            Quagga.start();
            console.log("Quagga started successfully");
        });

        let scannedCodes = new Set();
        let isPaused = false;
        
        Quagga.onDetected(async (result) => {
            if (isPaused) return;

            const code = result.codeResult.code;
            result.textContent = `Barcode ${scannedCodes.size} scanned`;

            if (!scannedCodes.has(code)) {
                console.log("Barcode detected:", code);
                scannedCodes.add(code);
        
                isPaused = true; // Pause scanning
        
                await fetchProductInfo(code);
        
                if (scannedCodes.size === 2) {
                    closeCamera();
                } else {
                    // Delay next scan (e.g., 2 seconds)
                    setTimeout(() => {
                        isPaused = false;
                    }, 2000);
                }
            } else {
                console.log("Duplicate barcode ignored:", code);
            }
        });
        

    } catch (err) {
        console.error("Camera/Scanner error:", err);
        alert("Could not access camera: " + err.message);
    }
}

// Function to close camera properly
function closeCamera() {
    console.log('closeCamera() called');
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    if (video) video.hidden = true;
    if (guideBox) guideBox.hidden = true;
    Quagga.stop();
}

// Reset the Scanner
function resetScanner() {
    console.log('resetScanner() called');
    scannedBarcodes = [];
    scannedProducts = [];
    if (comparisonContainer) comparisonContainer.innerHTML = '';
    if (productInfo) productInfo.style.display = 'none';
}


async function fetchProductInfo(barcode) {
    console.log('fetchProductInfo() called with barcode:', barcode);
    try {
        if (loading) loading.hidden = false;
        console.log('Fetching product info for barcode:', barcode);

        const response = await fetch('http://green-scanner.github.io//scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode })
        });

        const data = await response.json();

        if (response.ok) {
            if (!data.product_info) {
                console.log('No product info found.');
                return;
            }
            console.log('Categories from API:', data.product_info.categories);

            // Ensure categories are loaded before matching
            await loadCategories();  // Wait for categories to load

            // Match the categories
            const matchedCategory = await matchCategory(data.product_info.categories.toString().toLowerCase()); // Use await here to resolve the promise

            scannedProducts.push({
                barcode: barcode,
                name: data.product_info.name || 'No name available',
                genericName: data.product_info.generic_name || 'No generic name available',
                quantity: data.product_info.quantity || 'No quantity available',
                packaging: data.product_info.packaging || 'No packaging info',
                matchedCategory: matchedCategory || 'No category matched', // Use the resolved category
                labels: data.product_info.labels || 'No labels available',
                origins: data.product_info.origins || 'No origin information',
                manufacturingPlace: data.product_info.manufacturing_place || 'No manufacturing place info',
                ecoScore: data.product_info.ecoscore_grade || 'No eco-score available',
                image: data.product_info.image || ''
            });

            if (scannedProducts.length === 2) {
                closeCamera();           // 🔒 Stop the camera
                displayComparison();

            }
        } else {
            console.log(`Error: ${data.error}`);
        }
    } catch (err) {
        console.error('Error fetching product info:', err);
        console.log('Failed to fetch product info.');
    } finally {
        if (loading) loading.hidden = true;
    }
}

// Display Comparison of Two Products
async function displayComparison() {
    console.log('displayComparison() called');
    if (productInfo) productInfo.style.display = 'block';
    if (comparisonContainer) comparisonContainer.innerHTML = '';

    // Ensure you await the eco-impact calculation for both products
    const ecoImpactPromises = scannedProducts.map(async (product) => {
        const {
            totalScore,
            totalCo2Emission,
            co2EmissionPerKg,
            weightKg
        } = await calculateEcoImpact(product);

        return {
            product,
            totalScore,
            totalCo2Emission,
            co2EmissionPerKg,
            weightKg
        };
    });

    // Wait for all the eco-impact calculations to resolve
    const ecoImpactData = await Promise.all(ecoImpactPromises);

    // Find the product with the lowest and highest eco-impact score
    const minScore = Math.min(...ecoImpactData.map(data => data.totalScore));
    const maxScore = Math.max(...ecoImpactData.map(data => data.totalScore));

    ecoImpactData.forEach((ecoData) => {
        const { product, totalScore, totalCo2Emission, co2EmissionPerKg, weightKg } = ecoData;

        const productCard = document.createElement('div');
        productCard.classList.add('product-card');

        // Apply green or red border based on eco-impact score
        if (totalScore === minScore) {
            productCard.classList.add('low-impact');
        } else if (totalScore === maxScore) {
            productCard.classList.add('high-impact');
        }

        // Display the product details and eco-impact scores
        productCard.innerHTML = `
            <p><strong>Name:</strong> ${product.name}</p>
            <p><strong>Matched category:</strong> ${product.matchedCategory}</p>
            <p><strong>Quantity:</strong> ${product.quantity}</p>
            <p><strong>Origins:</strong> ${product.origins}</p>

            <p><strong>Eco-Impact Score:</strong> ${totalScore.toFixed(2)}</p>
            <p><strong>Total CO2 Emission:</strong> ${totalCo2Emission.toFixed(2)} kg CO₂e</p>
            <p><strong>CO2 Emission Per Kg:</strong> ${co2EmissionPerKg.toFixed(2)} kg CO₂e</p>
            <img src="${product.image}" alt="Product Image">
        `;

        // Add the card to the container
        comparisonContainer.appendChild(productCard);
    });
}

