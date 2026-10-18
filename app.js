const requiredColumns = ["CGG_NM", "STDG_NM", "BLDG_USG", "평균전세가_만원", "거래건수"];

const form = document.querySelector("#search-form");
const districtSelect = document.querySelector("#district");
const neighborhoodSelect = document.querySelector("#neighborhood");
const buildingTypeSelect = document.querySelector("#building-type");
const searchButton = document.querySelector(".search-button");
const dataStatus = document.querySelector("#data-status");
const results = document.querySelector("#results");
const resultContent = document.querySelector("#result-content");

let rows = [];

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
		populateOptions();
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

districtSelect.addEventListener("change", () => {
	const neighborhoods = uniqueSorted(
		rows.filter((row) => row.CGG_NM === districtSelect.value).map((row) => row.STDG_NM),
	);
	setOptions(neighborhoodSelect, "동 선택", neighborhoods);
	neighborhoodSelect.disabled = !districtSelect.value;
	neighborhoodSelect.value = "";
	results.hidden = true;
});

neighborhoodSelect.addEventListener("change", () => {
	results.hidden = true;
});

buildingTypeSelect.addEventListener("change", () => {
	results.hidden = true;
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
	results.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

loadData();
