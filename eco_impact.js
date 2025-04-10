import { matchCategory } from './category_matcher.js';

// Function to extract weight in kg
function parseWeight(quantity) {
    if (!quantity) return 1; // Default to 1 kg if missing

    const match = quantity.match(/([\d.]+)\s*(g|kg)/i);
    if (!match) return 1; // Default if format is unexpected

    let weight = parseFloat(match[1]);
    if (match[2].toLowerCase() === "g") {
        weight /= 1000; // Convert grams to kg
    }
    console.log("Weight:", weight); // Debugging
    return weight;
}


// Function to Calculate Eco-Impact Score
async function calculateEcoImpact(product, matchedCategory) {
    console.log("🟢 [INPUT PRODUCT DATA]:", product);

    const { quantity, origins = [], manufacturingPlace } = product; // Default origins to an empty array

    // Log the matched category
    console.log("🔍 Using matched category:", matchedCategory);

    // Ensure matchedCategory is a lowercase string
    if (typeof matchedCategory !== "string") {
        console.error("🔥 Matched category is not a string!");
        matchedCategory = 'default'; // Set to default if necessary
    }

    // Normalize the matched category to lowercase
    const formattedCategory = matchedCategory.toLowerCase();
    console.log(`🔍 Formatted category for lookup: ${formattedCategory}`);

    // Fetch CO2 emissions data
    const co2EmissionsData = await fetchCO2Emissions();
    const co2TransportData = await fetchTransportCO2();

    // Define max and min emissions from the fetched emissions data
    const maxEmission = Math.max(...Object.values(co2EmissionsData));
    const minEmission = Math.min(...Object.values(co2EmissionsData));

    // Define max and min transport emissions
    const maxTransportEmission = Math.max(...Object.values(co2TransportData));
    const minTransportEmission = Math.min(...Object.values(co2TransportData));

    // Get CO2 emissions per kg (fallbacks)
    const co2EmissionPerKgRaw = co2EmissionsData[formattedCategory] ?? 1.0; // Lookup emissions data
    console.log(`🏭 CO2 from production (per kg): ${co2EmissionPerKgRaw}`);

    // Determine the country for transport emissions
    let rawCountry = Array.isArray(origins) ? origins[0] : origins || manufacturingPlace || "Unknown";
    let country = typeof rawCountry === "string" ? rawCountry.toLowerCase() : "unknown";
    console.log(`🌍 Detected country of origin: ${country}`);

    const co2TransportPerKg = co2TransportData[country] ?? 1.0;
    console.log(`🚚 CO2 from transport (per kg): ${co2TransportPerKg}`);

    // Combine emissions per kg
    const co2EmissionPerKg = co2EmissionPerKgRaw + co2TransportPerKg;
    console.log(`⚙️ Combined CO2 per kg (prod + transport): ${co2EmissionPerKg}`);

    // Extract weight from quantity
    const weightKg = parseWeight(quantity);
    console.log(`⚖️ Weight in kg: ${weightKg}`);

    // Total emissions = (prod + transport) * weight
    const totalCo2Emission = co2EmissionPerKg * weightKg;
    console.log(`🌫️ Total CO2 emission = ${co2EmissionPerKg} * ${weightKg} = ${totalCo2Emission} kg CO₂e`);

    // Score from production CO2 emissions
    const co2Score = (maxEmission === minEmission)
        ? 3
        : ((co2EmissionPerKgRaw - minEmission) / (maxEmission - minEmission)) * 5 + 1;
    console.log(`📈 CO2 score (production): ${co2Score.toFixed(2)} (based on emission range)`);

    // Score from transport emissions
    const transportScore = (maxTransportEmission === minTransportEmission)
        ? 2
        : ((co2TransportPerKg - minTransportEmission) / (maxTransportEmission - minTransportEmission)) * 3 + 1;
    console.log(`📉 Transport score: ${transportScore.toFixed(2)} (based on emission range)`);

    // Total eco score
    const totalScore = co2Score + transportScore;
    console.log(`✅ Final Eco-Impact Score = ${co2Score.toFixed(2)} + ${transportScore.toFixed(2)} = ${totalScore.toFixed(2)}`);

    return {
        totalScore,
        totalCo2Emission,
        co2EmissionPerKg, // includes both prod + transport
        co2EmissionPerKgRaw, // just production
        co2TransportPerKg,
        co2Score,
        transportScore,
        weightKg
    };
}












async function fetchCO2Emissions() {
    try {
        const response = await fetch('co2_emission.json');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Failed to fetch CO2 emissions data:', error);
        return {};
    }
}

function normalizeKeys(obj) {
    const lowercased = {};
    for (let key in obj) {
        lowercased[key.toLowerCase()] = obj[key];
    }
    return lowercased;
}

async function fetchTransportCO2() {
    try {
        const response = await fetch('transportData.json');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        const normalized = normalizeKeys(data); // normalize keys here
        console.log("🚛 Normalized Transport CO2 Data:", normalized); // Debug output
        return normalized;
    } catch (error) {
        console.error('Failed to fetch transportation CO2 emissions data:', error);
        return {};
    }
}


export { calculateEcoImpact };
