const requiredColumns = ["CGG_NM", "STDG_NM", "BLDG_USG", "평균전세가_만원", "거래건수"];

const form = document.querySelector("#search-form");
const districtSelect = document.querySelector("#district");
const neighborhoodSelect = document.querySelector("#neighborhood");
const buildingTypeSelect = document.querySelector("#building-type");
const searchButton = document.querySelector(".search-button");
const dataStatus = document.querySelector("#data-status");
const results = document.querySelector("#results");
const resultContent = document.querySelector("#result-content");
const mapPanel = document.querySelector("#map-panel");
const mapElement = document.querySelector("#district-map");
const mapTitle = document.querySelector("#map-title");
const mapMethodNote = document.querySelector("#map-method-note");
const mapError = document.querySelector("#map-error");

let rows = [];
let districtMap = null;
let districtBoundaryLayer = null;
let districtMarker = null;
let neighborhoodStats = new Map();
let selectedDistrict = "";
let selectedNeighborhood = "";

const districtPriceBands = [
	{ max: 20000, color: "#f8e8d2", label: "2억원 미만" },
	{ max: 27000, color: "#f3d0a7", label: "2억 ~ 2억7,000만원" },
	{ max: 35000, color: "#edb77e", label: "2억7,000만 ~ 3억5,000만원" },
	{ max: 45000, color: "#e99150", label: "3억5,000만 ~ 4억5,000만원" },
	{ max: 60000, color: "#d46736", label: "4억5,000만 ~ 6억원" },
	{ max: Infinity, color: "#a84b27", label: "6억원 이상" },
];
const lowTransactionThreshold = 5;

const legalDistrictByCode = {
	11110: "종로구",
	11140: "중구",
	11170: "용산구",
	11200: "성동구",
	11215: "광진구",
	11230: "동대문구",
	11260: "중랑구",
	11290: "성북구",
	11305: "강북구",
	11320: "도봉구",
	11350: "노원구",
	11380: "은평구",
	11410: "서대문구",
	11440: "마포구",
	11470: "양천구",
	11500: "강서구",
	11530: "구로구",
	11545: "금천구",
	11560: "영등포구",
	11590: "동작구",
	11620: "관악구",
	11650: "서초구",
	11680: "강남구",
	11710: "송파구",
	11740: "강동구",
};

const districtCenters = {
	종로구: [37.5735, 126.9788],
	중구: [37.5636, 126.9976],
	용산구: [37.5326, 126.9905],
	성동구: [37.5634, 127.0369],
	광진구: [37.5385, 127.0823],
	동대문구: [37.5744, 127.0396],
	중랑구: [37.6063, 127.0925],
	성북구: [37.5894, 127.0167],
	강북구: [37.6396, 127.0257],
	도봉구: [37.6688, 127.0471],
	노원구: [37.6542, 127.0568],
	은평구: [37.6027, 126.9291],
	서대문구: [37.5791, 126.9368],
	마포구: [37.5663, 126.9019],
	양천구: [37.5170, 126.8665],
	강서구: [37.5509, 126.8495],
	구로구: [37.4954, 126.8874],
	금천구: [37.4519, 126.9020],
	영등포구: [37.5264, 126.8963],
	동작구: [37.5124, 126.9393],
	관악구: [37.4784, 126.9516],
	서초구: [37.4837, 127.0324],
	강남구: [37.5172, 127.0473],
	송파구: [37.5145, 127.1059],
	강동구: [37.5301, 127.1238],
};

// 따옴표 필드와 줄바꿈을 보존해 CSV를 행 배열로 읽습니다.
function parseCsv(text) {
	const records = [];
	let record = [];
	let field = "";
	let insideQuotes = false;

	for (let index = 0; index < text.length; index += 1) {
		const character = text[index];

		if (character === '"') {
			if (insideQuotes && text[index + 1] === '"') {
				field += '"';
				index += 1;
			} else {
				insideQuotes = !insideQuotes;
			}
		} else if (character === "," && !insideQuotes) {
			record.push(field);
			field = "";
		} else if ((character === "\n" || character === "\r") && !insideQuotes) {
			if (character === "\r" && text[index + 1] === "\n") index += 1;
			record.push(field);
			if (record.some((value) => value !== "")) records.push(record);
			record = [];
			field = "";
		} else {
			field += character;
		}
	}

	if (field !== "" || record.length > 0) {
		record.push(field);
		if (record.some((value) => value !== "")) records.push(record);
	}

	return records;
}

// CSV를 UTF-8로 불러오고 헤더를 기준으로 데이터 객체를 만듭니다.
async function loadData() {
	try {
		const response = await fetch("data/jeonse_mean.csv");
		if (!response.ok) throw new Error("CSV 응답을 확인할 수 없습니다.");

		const text = (await response.text()).replace(/^\uFEFF/, "");
		const records = parseCsv(text);
		const headers = records.shift()?.map((header) => header.trim().replace(/^\uFEFF/, "")) ?? [];
		const missingColumns = requiredColumns.filter((column) => !headers.includes(column));
		if (missingColumns.length > 0) throw new Error("CSV 열 이름이 올바르지 않습니다.");

		rows = records.map((record) => Object.fromEntries(
			headers.map((header, index) => [header, (record[index] ?? "").trim()]),
		));
		buildNeighborhoodStats();
		refreshDistrictLayer();
		populateOptions();
		updateMapMethodNote();
		districtSelect.disabled = false;
		buildingTypeSelect.disabled = false;
		searchButton.disabled = false;
		dataStatus.textContent = `${rows.length.toLocaleString("ko-KR")}건의 데이터를 불러왔습니다.`;
	} catch (error) {
		dataStatus.textContent = "데이터를 불러오지 못했습니다. 페이지를 다시 열어 주세요.";
		dataStatus.classList.add("is-error");
		console.error(error);
	}
}

// 선택 목록을 데이터에서 만들고 자치구에 따라 동 목록을 갱신합니다.
function setOptions(select, placeholder, values) {
	select.replaceChildren(new Option(placeholder, ""));
	values.forEach((value) => select.add(new Option(value, value)));
}

function uniqueSorted(values) {
	return [...new Set(values)].sort((left, right) => left.localeCompare(right, "ko-KR"));
}

function populateOptions() {
	setOptions(districtSelect, "자치구 선택", uniqueSorted(rows.map((row) => row.CGG_NM)));
	setOptions(buildingTypeSelect, "주택유형 선택", uniqueSorted(rows.map((row) => row.BLDG_USG)));
}


function getNeighborhoodKey(district, neighborhood) {
	return `${district}|${neighborhood}`;
}

function buildNeighborhoodStats() {
	const totals = new Map();
	const activeRows = buildingTypeSelect.value
		? rows.filter((row) => row.BLDG_USG === buildingTypeSelect.value)
		: rows;
	activeRows.forEach((row) => {
		const transactionCount = Number(row["거래건수"]);
		const averagePrice = Number(row["평균전세가_만원"]);
		if (!Number.isFinite(transactionCount) || !Number.isFinite(averagePrice) || transactionCount <= 0) return;

		const key = getNeighborhoodKey(row.CGG_NM, row.STDG_NM);
		const total = totals.get(key) ?? { weightedPrice: 0, transactionCount: 0 };
		total.weightedPrice += averagePrice * transactionCount;
		total.transactionCount += transactionCount;
		totals.set(key, total);
	});

	neighborhoodStats = new Map([...totals].map(([key, total]) => [key, {
		averagePrice: total.weightedPrice / total.transactionCount,
		transactionCount: total.transactionCount,
	}]));
}

districtSelect.addEventListener("change", () => {
	const neighborhoods = uniqueSorted(
		rows.filter((row) => row.CGG_NM === districtSelect.value).map((row) => row.STDG_NM),
	);
	setOptions(neighborhoodSelect, "동 선택", neighborhoods);
	neighborhoodSelect.disabled = !districtSelect.value;
	neighborhoodSelect.value = "";
	results.hidden = true;
	updateMapSelection(districtSelect.value);
});

neighborhoodSelect.addEventListener("change", () => {
	results.hidden = true;
	updateMapSelection(districtSelect.value, neighborhoodSelect.value);
});

buildingTypeSelect.addEventListener("change", () => {
	results.hidden = true;
	buildNeighborhoodStats();
	refreshDistrictLayer();
	updateMapMethodNote();
});

// 만원 단위 금액을 억·만원 단위의 한국식 표기로 바꿉니다.
function formatPrice(value) {
	const roundedAmount = Math.round(Number(value));
	if (!Number.isFinite(roundedAmount)) return "정보 없음";

	const billions = Math.floor(roundedAmount / 10000);
	const remainder = roundedAmount % 10000;
	if (billions === 0) return `약 ${remainder.toLocaleString("ko-KR")}만원`;
	if (remainder === 0) return `약 ${billions.toLocaleString("ko-KR")}억원`;
	return `약 ${billions.toLocaleString("ko-KR")}억 ${remainder.toLocaleString("ko-KR")}만원`;
}

function makeResultCard(label, value, className, unit = "") {
	const card = document.createElement("article");
	card.className = `result-card ${className}`;

	const heading = document.createElement("p");
	heading.className = "result-label";
	heading.textContent = label;
	const content = document.createElement("p");
	content.className = "result-value";
	content.textContent = value;

	if (unit) {
		const unitLabel = document.createElement("span");
		unitLabel.className = "result-unit";
		unitLabel.textContent = unit;
		content.append(unitLabel);
	}

	card.append(heading, content);
	return card;
}

function getDistrictBand(averagePrice) {
	return districtPriceBands.find((band) => averagePrice < band.max) ?? districtPriceBands.at(-1);
}

function getDistrictStyle(feature) {
	const properties = feature.properties;
	const district = legalDistrictByCode[String(properties.EMD_CD).slice(0, 5)];
	const neighborhood = String(properties.EMD_KOR_NM).trim();
	const stats = neighborhoodStats.get(getNeighborhoodKey(district, neighborhood));
	const isSelected = district === selectedDistrict && neighborhood === selectedNeighborhood;
	const hasReliableVolume = stats && stats.transactionCount >= lowTransactionThreshold;
	return {
		color: isSelected ? "#282b25" : "#fffdf8",
		weight: isSelected ? 3 : 1,
		opacity: 1,
		fillColor: hasReliableVolume ? getDistrictBand(stats.averagePrice).color : "#d8d5ce",
		fillOpacity: stats ? 0.86 : 0.42,
	};
}

function createNeighborhoodPopup(district, neighborhood) {
	const popup = document.createElement("div");
	popup.className = "district-popup";
	const heading = document.createElement("strong");
	heading.textContent = district;
	popup.append(heading);
	const subheading = document.createElement("span");
	subheading.className = "district-popup-neighborhood";
	subheading.textContent = neighborhood;
	popup.append(subheading);

	const stats = neighborhoodStats.get(getNeighborhoodKey(district, neighborhood));
	if (!stats) {
		const empty = document.createElement("p");
		empty.textContent = "해당 동의 집계 데이터가 없습니다.";
		popup.append(empty);
		return popup;
	}

	[
		["평균 전세가", formatPrice(stats.averagePrice)],
		["거래 건수", `${stats.transactionCount.toLocaleString("ko-KR")}건`],
	].forEach(([label, value]) => {
		const row = document.createElement("p");
		const rowLabel = document.createElement("span");
		rowLabel.textContent = label;
		const rowValue = document.createElement("b");
		rowValue.textContent = value;
		row.append(rowLabel, rowValue);
		popup.append(row);
	});
	if (stats.transactionCount < lowTransactionThreshold) {
		const warning = document.createElement("p");
		warning.className = "district-popup-warning";
		warning.textContent = `거래 ${lowTransactionThreshold}건 미만 · 참고용`;
		popup.append(warning);
	}

	return popup;
}

function addDistrictLegend() {
	const legend = L.control({ position: "bottomright" });
	legend.onAdd = () => {
		const container = L.DomUtil.create("div", "district-legend");
		const title = document.createElement("strong");
		title.textContent = "동별 평균 전세가";
		container.append(title);
		districtPriceBands.forEach((band) => {
			const row = document.createElement("div");
			row.className = "district-legend-row";
			const swatch = document.createElement("span");
			swatch.className = "district-legend-swatch";
			swatch.style.backgroundColor = band.color;
			const label = document.createElement("span");
			label.textContent = band.label;
			row.append(swatch, label);
			container.append(row);
		});
		const lowVolumeRow = document.createElement("div");
		lowVolumeRow.className = "district-legend-row";
		const lowVolumeSwatch = document.createElement("span");
		lowVolumeSwatch.className = "district-legend-swatch";
		lowVolumeSwatch.style.backgroundColor = "#d8d5ce";
		const lowVolumeLabel = document.createElement("span");
		lowVolumeLabel.textContent = "거래 5건 미만 / 자료 없음";
		lowVolumeRow.append(lowVolumeSwatch, lowVolumeLabel);
		container.append(lowVolumeRow);
		L.DomEvent.disableClickPropagation(container);
		return container;
	};
	legend.addTo(districtMap);
}

function refreshDistrictLayer() {
	districtBoundaryLayer?.setStyle(getDistrictStyle);
}

function updateMapMethodNote() {
	const buildingType = buildingTypeSelect.value;
	mapMethodNote.textContent = buildingType
		? `${buildingType} 거래 기준 동별 평균입니다. 평균가는 거래건수로 가중하며 거래 5건 미만은 회색 처리합니다. 현재 CSV는 단일 기간 집계입니다. 법정동 경계 기준: 2015.`
		: "모든 주택유형의 동별 평균입니다. 평균가는 거래건수로 가중하며 거래 5건 미만은 회색 처리합니다. 현재 CSV는 단일 기간 집계입니다. 법정동 경계 기준: 2015.";
}

function updateMapSelection(district = "", neighborhood = "") {
	selectedDistrict = district;
	selectedNeighborhood = neighborhood;
	const selection = [district, neighborhood].filter(Boolean).join(" ");
	mapTitle.textContent = selection
		? `서울 전역 · ${selection} 선택`
		: "서울 전역 · 법정동별 평균 전세가";
	refreshDistrictLayer();

	if (!districtBoundaryLayer && districtMap) {
		const center = districtCenters[district] ?? [37.5665, 126.9780];
		if (!districtMarker) districtMarker = L.marker(center).addTo(districtMap);
		else districtMarker.setLatLng(center);
	}
}

function addDistrictFeatureEvents(feature, layer) {
	const district = legalDistrictByCode[String(feature.properties.EMD_CD).slice(0, 5)];
	const neighborhood = String(feature.properties.EMD_KOR_NM).trim();
	layer.bindTooltip(`${district} ${neighborhood}`, {
		permanent: false,
		sticky: true,
		direction: "center",
		className: "district-name-label",
		opacity: 0.95,
	});
	layer.on("mouseover", (event) => {
		event.target.setStyle({ weight: 2.5, fillOpacity: 0.96 });
		event.target.bringToFront();
	});
	layer.on("mouseout", (event) => districtBoundaryLayer?.resetStyle(event.target));
	layer.on("click", (event) => {
		const hasData = rows.some((row) => row.CGG_NM === district && row.STDG_NM === neighborhood);
		if (hasData && [...districtSelect.options].some((option) => option.value === district)) {
			districtSelect.value = district;
			districtSelect.dispatchEvent(new Event("change", { bubbles: true }));
			if ([...neighborhoodSelect.options].some((option) => option.value === neighborhood)) {
				neighborhoodSelect.value = neighborhood;
				updateMapSelection(district, neighborhood);
			}
		}
		layer.bindPopup(createNeighborhoodPopup(district, neighborhood), { closeButton: false }).openPopup(event.latlng);
	});
}

async function initializeDistrictMap() {
	if (!window.L) {
		mapError.hidden = false;
		return;
	}

	districtMap = L.map(mapElement, { scrollWheelZoom: false }).setView([37.5665, 126.9780], 10);
	L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
		attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
		maxZoom: 19,
	}).addTo(districtMap);
	addDistrictLegend();

	try {
		const response = await fetch("data/seoul_legal_dongs.geojson");
		if (!response.ok) throw new Error("법정동 경계 데이터를 불러오지 못했습니다.");
		const boundaries = await response.json();
		districtBoundaryLayer = L.geoJSON(boundaries, {
			style: getDistrictStyle,
			onEachFeature: addDistrictFeatureEvents,
		}).addTo(districtMap);
		if (districtMarker) {
			districtMap.removeLayer(districtMarker);
			districtMarker = null;
		}
		districtMap.fitBounds(districtBoundaryLayer.getBounds(), { padding: [22, 22] });
		mapError.hidden = true;
		refreshDistrictLayer();
	} catch (error) {
		mapError.hidden = false;
		console.error(error);
	}

	requestAnimationFrame(() => districtMap.invalidateSize());
}

// 세 조건이 모두 같은 CSV 행만 찾아 결과 카드에 표시합니다.
form.addEventListener("submit", (event) => {
	event.preventDefault();
	const match = rows.find((row) =>
		row.CGG_NM === districtSelect.value
		&& row.STDG_NM === neighborhoodSelect.value
		&& row.BLDG_USG === buildingTypeSelect.value,
	);

	resultContent.replaceChildren();
	if (!match) {
		const message = document.createElement("p");
		message.className = "empty-state";
		message.textContent = "해당 조건의 데이터가 없습니다.";
		resultContent.append(message);
	} else {
		const grid = document.createElement("div");
		grid.className = "result-grid";
		grid.append(
			makeResultCard("조회 조건", `${match.CGG_NM} · ${match.STDG_NM} / ${match.BLDG_USG}`, "result-card--condition"),
			makeResultCard("평균 전세가", formatPrice(match["평균전세가_만원"]), "result-card--price"),
			makeResultCard("거래 건수", Number(match["거래건수"]).toLocaleString("ko-KR"), "result-card--count", "건"),
		);
		resultContent.append(grid);
	}

	results.hidden = false;
	if (match) updateMapSelection(match.CGG_NM, match.STDG_NM);
	results.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

initializeDistrictMap();
loadData();
