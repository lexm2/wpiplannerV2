(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))s(r);new MutationObserver(r=>{for(const n of r)if(n.type==="childList")for(const o of n.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&s(o)}).observe(document,{childList:!0,subtree:!0});function t(r){const n={};return r.integrity&&(n.integrity=r.integrity),r.referrerPolicy&&(n.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?n.credentials="include":r.crossOrigin==="anonymous"?n.credentials="omit":n.credentials="same-origin",n}function s(r){if(r.ep)return;r.ep=!0;const n=t(r);fetch(r.href,n)}})();var l=(m=>(m.MONDAY="mon",m.TUESDAY="tue",m.WEDNESDAY="wed",m.THURSDAY="thu",m.FRIDAY="fri",m.SATURDAY="sat",m.SUNDAY="sun",m))(l||{});const b=class b{constructor(){this.scheduleDB=null}async loadCourseData(){try{console.log("Loading course data...");const e=await this.fetchFreshData();return this.scheduleDB=e,e}catch(e){throw console.error("Failed to load course data:",e),new Error("No course data available")}}async fetchFreshData(){console.log("Fetching course data from local static file...");const e=await fetch(b.WPI_COURSE_DATA_URL,{method:"GET",headers:{Accept:"application/json"},cache:"no-cache"});if(!e.ok)throw new Error(`Failed to fetch course data: ${e.status} ${e.statusText}`);const t=await e.json();return this.parseJSONData(t)}parseJSONData(e){if(console.log("Parsing constructed JSON data..."),!e.departments||!Array.isArray(e.departments))throw console.error("Invalid JSON data structure:",e),new Error("Invalid JSON data structure - missing departments array");console.log(`Processing ${e.departments.length} departments...`);const t={departments:this.parseConstructedDepartments(e.departments),generated:e.generated||new Date().toISOString()};return console.log(`Loaded ${t.departments.length} departments with course data`),this.logMA1024Sections(t),t}parseConstructedDepartments(e){return e.map(t=>{const s={abbreviation:t.abbreviation,name:t.name,courses:[]};return s.courses=t.courses.map(r=>({id:r.id,number:r.number,name:r.name,description:this.stripHtml(r.description||""),department:s,sections:this.parseConstructedSections(r.sections||[]),minCredits:r.min_credits||0,maxCredits:r.max_credits||0})),s})}parseConstructedSections(e){return e.map(t=>({crn:t.crn||0,number:t.number||"",seats:t.seats||0,seatsAvailable:t.seats_available||0,actualWaitlist:t.actual_waitlist||0,maxWaitlist:t.max_waitlist||0,note:t.note,description:this.stripHtml(t.description||""),term:t.term||"",periods:this.parseConstructedPeriods(t.periods||[])}))}parseConstructedPeriods(e){return e.map(t=>({type:t.type||"Lecture",professor:t.professor||"",professorEmail:void 0,startTime:this.parseConstructedTime(t.start_time),endTime:this.parseConstructedTime(t.end_time),location:t.location||"",building:t.building||"",room:t.room||"",seats:t.seats||0,seatsAvailable:t.seats_available||0,actualWaitlist:t.actual_waitlist||0,maxWaitlist:t.max_waitlist||0,days:this.parseConstructedDays(t.days||[]),specificSection:t.specific_section}))}parseConstructedTime(e){if(!e||e==="TBA")return{hours:0,minutes:0,displayTime:"TBD"};const t=e.match(/(\d{1,2}):(\d{2})/);if(!t)return{hours:0,minutes:0,displayTime:e};const s=parseInt(t[1]),r=parseInt(t[2]),n=s===0?12:s>12?s-12:s,o=s>=12?"PM":"AM",i=`${n}:${r.toString().padStart(2,"0")} ${o}`;return{hours:s,minutes:r,displayTime:i}}parseConstructedDays(e){const t=new Set;for(const s of e)switch(s.toLowerCase()){case"mon":t.add(l.MONDAY);break;case"tue":t.add(l.TUESDAY);break;case"wed":t.add(l.WEDNESDAY);break;case"thu":t.add(l.THURSDAY);break;case"fri":t.add(l.FRIDAY);break;case"sat":t.add(l.SATURDAY);break;case"sun":t.add(l.SUNDAY);break}return t}logMA1024Sections(e){const t=e.departments.find(r=>r.abbreviation==="MA");if(!t){console.log("MA department not found");return}const s=t.courses.find(r=>r.number==="1024");if(!s){console.log("MA1024 course not found");return}console.log(`
=== MA1024 SECTIONS (${s.sections.length} total) ===`),s.sections.forEach(r=>{console.log(`Section ${r.number}:`),console.log(`  Term: ${r.term}`),console.log(`  Enrollment: ${r.seatsAvailable}/${r.seats} available`),console.log(`  Periods (${r.periods.length}):`),r.periods.forEach((n,o)=>{const i=Array.from(n.days).join(", ");console.log(`    ${o+1}. ${n.type} - ${i} ${n.startTime.displayTime}-${n.endTime.displayTime} (${n.professor})`)}),console.log("")})}stripHtml(e){return e.replace(/<[^>]*>/g,"").replace(/&[^;]+;/g," ").trim()}getCachedData(){try{const e=localStorage.getItem(b.LOCAL_STORAGE_KEY);return e?JSON.parse(e).scheduleDB:null}catch(e){return console.warn("Failed to parse cached course data:",e),null}}cacheData(e){try{const t={scheduleDB:e,timestamp:Date.now()};localStorage.setItem(b.LOCAL_STORAGE_KEY,JSON.stringify(t)),console.log("Course data cached successfully")}catch(t){console.warn("Failed to cache course data:",t)}}isCacheExpired(){try{const e=localStorage.getItem(b.LOCAL_STORAGE_KEY);if(!e)return!0;const t=JSON.parse(e),s=Date.now()-t.timestamp,r=b.CACHE_EXPIRY_HOURS*60*60*1e3;return s>r}catch{return!0}}getScheduleDB(){return this.scheduleDB}searchCourses(e,t){if(!this.scheduleDB)return[];const s=[];for(const n of this.scheduleDB.departments)t&&t.length>0&&!t.includes(n.abbreviation.toLowerCase())||s.push(...n.courses);if(!e.trim())return s;const r=e.toLowerCase();return s.filter(n=>n.name.toLowerCase().includes(r)||n.number.toLowerCase().includes(r)||n.id.toLowerCase().includes(r)||n.department.abbreviation.toLowerCase().includes(r))}getAllDepartments(){return this.scheduleDB?.departments||[]}};b.WPI_COURSE_DATA_URL="./course-data-constructed.json",b.LOCAL_STORAGE_KEY="wpi-course-data",b.CACHE_EXPIRY_HOURS=1;let R=b;const B="WPI Classic",H="wpi-classic",P="Traditional WPI colors and styling",N={primary:"#ac2b37",primaryHover:"#8e2329",primaryLight:"#d4424f",secondary:"#f5f5f7",secondaryHover:"#e5e5e7",background:"#f5f5f7",backgroundAlt:"#ffffff",surface:"#ffffff",surfaceHover:"#fbfbfd",text:"#1d1d1f",textSecondary:"#86868b",textInverse:"#ffffff",border:"#e5e5e7",borderHover:"#d2d2d7",success:"#30d158",warning:"#ff9500",error:"#d32f2f",info:"#007aff"},F={fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",fontFamilyMono:"'SF Mono', Monaco, 'Cascadia Code', monospace"},U={baseUnit:"1rem",headerHeight:"64px",sidebarWidth:"280px",rightPanelWidth:"320px"},Y={borderRadius:"6px",borderRadiusLarge:"8px",shadow:"0 1px 3px rgba(0,0,0,0.1)",shadowHover:"0 2px 8px rgba(172, 43, 55, 0.1)",transition:"all 0.2s ease"},j={name:B,id:H,description:P,colors:N,typography:F,spacing:U,effects:Y},V="WPI Dark",G="wpi-dark",z="Dark mode theme with WPI accent colors",W={primary:"#d4424f",primaryHover:"#ac2b37",primaryLight:"#e85a66",secondary:"#2c2c2e",secondaryHover:"#3a3a3c",background:"#1c1c1e",backgroundAlt:"#2c2c2e",surface:"#2c2c2e",surfaceHover:"#3a3a3c",text:"#ffffff",textSecondary:"#98989d",textInverse:"#1d1d1f",border:"#3a3a3c",borderHover:"#48484a",success:"#30d158",warning:"#ff9f0a",error:"#ff453a",info:"#64d2ff"},_={fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",fontFamilyMono:"'SF Mono', Monaco, 'Cascadia Code', monospace"},q={baseUnit:"1rem",headerHeight:"64px",sidebarWidth:"280px",rightPanelWidth:"320px"},K={borderRadius:"6px",borderRadiusLarge:"8px",shadow:"0 2px 8px rgba(0,0,0,0.3)",shadowHover:"0 4px 16px rgba(212, 66, 79, 0.2)",transition:"all 0.2s ease"},J={name:V,id:G,description:z,colors:W,typography:_,spacing:q,effects:K},Z="WPI Light",X="wpi-light",Q="Clean light theme with softer WPI colors",ee={primary:"#b8394a",primaryHover:"#9c2f3d",primaryLight:"#d4556b",secondary:"#f8f8fa",secondaryHover:"#ededef",background:"#ffffff",backgroundAlt:"#f8f8fa",surface:"#ffffff",surfaceHover:"#f8f8fa",text:"#2c2c2e",textSecondary:"#6d6d70",textInverse:"#ffffff",border:"#d1d1d6",borderHover:"#c7c7cc",success:"#28a745",warning:"#fd7e14",error:"#dc3545",info:"#17a2b8"},te={fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",fontFamilyMono:"'SF Mono', Monaco, 'Cascadia Code', monospace"},se={baseUnit:"1rem",headerHeight:"64px",sidebarWidth:"280px",rightPanelWidth:"320px"},re={borderRadius:"8px",borderRadiusLarge:"12px",shadow:"0 1px 4px rgba(0,0,0,0.08)",shadowHover:"0 3px 12px rgba(184, 57, 74, 0.15)",transition:"all 0.2s ease"},oe={name:Z,id:X,description:Q,colors:ee,typography:te,spacing:se,effects:re},ne="High Contrast",ie="high-contrast",ce="Accessibility-focused high contrast theme",ae={primary:"#000000",primaryHover:"#333333",primaryLight:"#666666",secondary:"#ffffff",secondaryHover:"#f0f0f0",background:"#ffffff",backgroundAlt:"#f8f8f8",surface:"#ffffff",surfaceHover:"#f0f0f0",text:"#000000",textSecondary:"#444444",textInverse:"#ffffff",border:"#000000",borderHover:"#333333",success:"#006600",warning:"#cc6600",error:"#cc0000",info:"#0066cc"},le={fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",fontFamilyMono:"'SF Mono', Monaco, 'Cascadia Code', monospace"},de={baseUnit:"1rem",headerHeight:"64px",sidebarWidth:"280px",rightPanelWidth:"320px"},ue={borderRadius:"2px",borderRadiusLarge:"4px",shadow:"0 0 0 2px #000000",shadowHover:"0 0 0 3px #000000",transition:"all 0.1s ease"},me={name:ne,id:ie,description:ce,colors:ae,typography:le,spacing:de,effects:ue};class M{constructor(){this.currentTheme="wpi-classic",this.themes=new Map,this.listeners=new Set,this.storageKey="wpi-planner-theme",this.initializeThemes(),this.loadSavedTheme()}static getInstance(){return M.instance||(M.instance=new M),M.instance}initializeThemes(){this.registerTheme(j),this.registerTheme(J),this.registerTheme(oe),this.registerTheme(me)}loadSavedTheme(){try{const e=localStorage.getItem(this.storageKey);e&&this.themes.has(e)&&(this.currentTheme=e)}catch(e){console.warn("Failed to load saved theme preference:",e)}this.applyTheme(this.currentTheme)}registerTheme(e){if(!this.isValidTheme(e)){console.error("Invalid theme definition:",e);return}this.themes.set(e.id,e)}isValidTheme(e){return e&&typeof e.name=="string"&&typeof e.id=="string"&&typeof e.description=="string"&&e.colors&&e.typography&&e.spacing&&e.effects}getAvailableThemes(){return Array.from(this.themes.values())}getCurrentTheme(){return this.themes.get(this.currentTheme)||null}getCurrentThemeId(){return this.currentTheme}setTheme(e){if(!this.themes.has(e))return console.error(`Theme '${e}' not found`),!1;const t=this.currentTheme,s=e,r=this.themes.get(e);this.currentTheme=e,this.applyTheme(e),this.saveThemePreference(e);const n={oldTheme:t,newTheme:s,themeDefinition:r};return this.notifyListeners(n),!0}applyTheme(e){const t=this.themes.get(e);if(!t)return;const s=document.documentElement;Object.entries(t.colors).forEach(([r,n])=>{s.style.setProperty(`--color-${this.kebabCase(r)}`,n)}),Object.entries(t.typography).forEach(([r,n])=>{s.style.setProperty(`--font-${this.kebabCase(r)}`,n)}),Object.entries(t.spacing).forEach(([r,n])=>{s.style.setProperty(`--spacing-${this.kebabCase(r)}`,n)}),Object.entries(t.effects).forEach(([r,n])=>{s.style.setProperty(`--effect-${this.kebabCase(r)}`,n)}),document.body.className=document.body.className.replace(/theme-[\w-]+/g,"").trim(),document.body.classList.add(`theme-${e}`)}kebabCase(e){return e.replace(/([a-z])([A-Z])/g,"$1-$2").toLowerCase()}saveThemePreference(e){try{localStorage.setItem(this.storageKey,e)}catch(t){console.warn("Failed to save theme preference:",t)}}detectSystemPreference(){if(typeof window<"u"&&window.matchMedia){if(window.matchMedia("(prefers-color-scheme: dark)").matches)return"wpi-dark";if(window.matchMedia("(prefers-contrast: high)").matches)return"high-contrast"}return"wpi-classic"}useSystemPreference(){const e=this.detectSystemPreference();return this.setTheme(e)}onThemeChange(e){this.listeners.add(e)}offThemeChange(e){this.listeners.delete(e)}notifyListeners(e){this.listeners.forEach(t=>{try{t(e)}catch(s){console.error("Error in theme change listener:",s)}})}previewTheme(e){return this.themes.has(e)?(this.applyTheme(e),!0):!1}resetToCurrentTheme(){this.applyTheme(this.currentTheme)}exportCurrentTheme(){const e=this.getCurrentTheme();if(!e)throw new Error("No current theme to export");return JSON.stringify(e,null,2)}importTheme(e){try{const t=JSON.parse(e);return this.isValidTheme(t)?(this.registerTheme(t),!0):!1}catch(t){return console.error("Failed to import theme:",t),!1}}getThemeById(e){return this.themes.get(e)||null}hasTheme(e){return this.themes.has(e)}removeTheme(e){return["wpi-classic","wpi-dark","wpi-light","high-contrast"].includes(e)?(console.warn(`Cannot remove built-in theme: ${e}`),!1):(this.currentTheme===e&&this.setTheme("wpi-classic"),this.themes.delete(e))}}const S=class S{constructor(){this.replacer=(e,t)=>{if(t instanceof Set)return{__type:"Set",value:[...t]};if(e==="department"&&t&&t.courses)return{abbreviation:t.abbreviation,name:t.name};if(!(e==="selectedSection"&&t&&typeof t=="object"&&t.number))return t},this.reviver=(e,t)=>typeof t=="object"&&t!==null&&t.__type==="Set"?new Set(t.value):t}saveUserState(e){this.handleStorageOperation(()=>{const t=JSON.stringify(e,this.replacer);localStorage.setItem(S.STORAGE_KEYS.USER_STATE,t)},"Failed to save user state")}loadUserState(){return this.handleStorageOperation(()=>{const e=localStorage.getItem(S.STORAGE_KEYS.USER_STATE);return e?JSON.parse(e,this.reviver):null},"Failed to load user state",null)}saveSchedule(e){this.handleStorageOperation(()=>{const t=this.loadAllSchedules(),s=t.findIndex(n=>n.id===e.id);s>=0?t[s]=e:t.push(e);const r=JSON.stringify(t,this.replacer);localStorage.setItem(S.STORAGE_KEYS.SCHEDULES,r)},"Failed to save schedule")}loadSchedule(e){try{return this.loadAllSchedules().find(s=>s.id===e)||null}catch(t){return console.warn("Failed to load schedule:",t),null}}loadAllSchedules(){return this.handleStorageOperation(()=>{const e=localStorage.getItem(S.STORAGE_KEYS.SCHEDULES);return e?JSON.parse(e,this.reviver):[]},"Failed to load schedules",[])}deleteSchedule(e){try{const s=this.loadAllSchedules().filter(r=>r.id!==e);localStorage.setItem(S.STORAGE_KEYS.SCHEDULES,JSON.stringify(s))}catch(t){console.warn("Failed to delete schedule:",t)}}savePreferences(e){this.handleStorageOperation(()=>{const t=JSON.stringify(e,this.replacer);localStorage.setItem(S.STORAGE_KEYS.PREFERENCES,t)},"Failed to save preferences")}loadPreferences(){return this.handleStorageOperation(()=>{const e=localStorage.getItem(S.STORAGE_KEYS.PREFERENCES);return e?JSON.parse(e,this.reviver):this.getDefaultPreferences()},"Failed to load preferences",this.getDefaultPreferences())}getDefaultPreferences(){return{preferredTimeRange:{startTime:{hours:8,minutes:0},endTime:{hours:18,minutes:0}},preferredDays:new Set(["mon","tue","wed","thu","fri"]),avoidBackToBackClasses:!1,theme:"wpi-classic"}}clearAllData(){try{Object.values(S.STORAGE_KEYS).forEach(e=>{localStorage.removeItem(e)})}catch(e){console.warn("Failed to clear storage:",e)}}exportData(){const e=this.loadUserState(),t=this.loadAllSchedules(),s=this.loadPreferences(),r={version:"1.0",timestamp:new Date().toISOString(),state:e,schedules:t,preferences:s};return JSON.stringify(r,null,2)}importData(e){try{const t=JSON.parse(e);return t.state&&this.saveUserState(t.state),t.preferences&&this.savePreferences(t.preferences),t.schedules&&t.schedules.forEach(s=>{this.saveSchedule(s)}),!0}catch(t){return console.error("Failed to import data:",t),!1}}handleStorageOperation(e,t,s){try{return e()}catch(r){return console.warn(`${t}:`,r),s}}saveThemePreference(e){try{localStorage.setItem(S.STORAGE_KEYS.THEME,e)}catch(t){console.warn("Failed to save theme preference:",t)}}loadThemePreference(){try{return localStorage.getItem(S.STORAGE_KEYS.THEME)||"wpi-classic"}catch(e){return console.warn("Failed to load theme preference:",e),"wpi-classic"}}saveSelectedCourses(e){this.handleStorageOperation(()=>{const t=JSON.stringify(e,this.replacer);localStorage.setItem(S.STORAGE_KEYS.SELECTED_COURSES,t)},"Failed to save selected courses")}loadSelectedCourses(){return this.handleStorageOperation(()=>{const e=localStorage.getItem(S.STORAGE_KEYS.SELECTED_COURSES);return e?JSON.parse(e,this.reviver):[]},"Failed to load selected courses",[])}clearSelectedCourses(){try{localStorage.removeItem(S.STORAGE_KEYS.SELECTED_COURSES)}catch(e){console.warn("Failed to clear selected courses:",e)}}};S.STORAGE_KEYS={USER_STATE:"wpi-planner-user-state",PREFERENCES:"wpi-planner-preferences",SCHEDULES:"wpi-planner-schedules",SELECTED_COURSES:"wpi-planner-selected-courses",THEME:"wpi-planner-theme"};let O=S;class he{constructor(){this.dropdownElement=null,this.optionsElement=null,this.currentThemeNameElement=null,this.isOpen=!1,this.themeManager=M.getInstance(),this.storageManager=new O,this.init()}init(){this.setupElements(),this.loadSavedTheme(),this.setupEventListeners(),this.renderThemeOptions()}setupElements(){this.dropdownElement=document.getElementById("theme-dropdown"),this.optionsElement=document.getElementById("theme-options"),this.currentThemeNameElement=document.getElementById("current-theme-name")}loadSavedTheme(){const e=this.storageManager.loadThemePreference();this.themeManager.setTheme(e),this.updateCurrentThemeDisplay()}setupEventListeners(){!this.dropdownElement||!this.optionsElement||(this.dropdownElement.addEventListener("click",e=>{e.stopPropagation(),this.toggleDropdown()}),document.addEventListener("click",()=>{this.closeDropdown()}),this.optionsElement.addEventListener("click",e=>{e.stopPropagation()}))}toggleDropdown(){this.isOpen?this.closeDropdown():this.openDropdown()}openDropdown(){!this.dropdownElement||!this.optionsElement||(this.isOpen=!0,this.dropdownElement.classList.add("open"),this.optionsElement.classList.add("show"))}closeDropdown(){!this.dropdownElement||!this.optionsElement||(this.isOpen=!1,this.dropdownElement.classList.remove("open"),this.optionsElement.classList.remove("show"))}renderThemeOptions(){if(!this.optionsElement)return;const e=this.themeManager.getAvailableThemes(),t=this.themeManager.getCurrentThemeId();let s="";e.forEach(r=>{const n=r.id===t;s+=`
                <div class="theme-option ${n?"active":""}" data-theme-id="${r.id}">
                    <div class="theme-option-name">${r.name}</div>
                    <div class="theme-option-description">${r.description}</div>
                </div>
            `}),this.optionsElement.innerHTML=s,this.optionsElement.querySelectorAll(".theme-option").forEach(r=>{r.addEventListener("click",()=>{const n=r.dataset.themeId;n&&this.selectTheme(n)})})}selectTheme(e){this.themeManager.setTheme(e)&&(this.storageManager.saveThemePreference(e),this.updateCurrentThemeDisplay(),this.updateActiveOption(e),this.closeDropdown())}updateCurrentThemeDisplay(){if(!this.currentThemeNameElement)return;const e=this.themeManager.getCurrentTheme();e&&(this.currentThemeNameElement.textContent=e.name)}updateActiveOption(e){if(!this.optionsElement)return;this.optionsElement.querySelectorAll(".theme-option").forEach(s=>{s.classList.remove("active")});const t=this.optionsElement.querySelector(`[data-theme-id="${e}"]`);t&&t.classList.add("active")}refresh(){this.renderThemeOptions(),this.updateCurrentThemeDisplay()}setTheme(e){this.selectTheme(e)}}class fe{constructor(){this.selectedCourses=new Map,this.listeners=new Set,this.allSections=new Set,this.allDepartments=[]}addCourse(e,t=!1){const s={course:e,selectedSection:null,selectedSectionNumber:null,isRequired:t};this.selectedCourses.set(e,s),this.notifyListeners()}removeCourse(e){this.selectedCourses.delete(e),this.notifyListeners()}getSelectedCourses(){return Array.from(this.selectedCourses.values())}getSelectedCourse(e){return this.selectedCourses.get(e)}isSelected(e){return this.selectedCourses.has(e)}getAvailableSections(e){const t=this.selectedCourses.get(e);return this.validateCourseExists(e,t)?t.course.sections:[]}clearAll(){this.selectedCourses.clear(),this.notifyListeners()}onSelectionChange(e){this.listeners.add(e)}offSelectionChange(e){this.listeners.delete(e)}setSelectedSection(e,t){const s=this.selectedCourses.get(e);if(!this.validateCourseExists(e,s))return;const r=t&&e.sections.find(n=>n.number===t)||null;s.selectedSection=r,s.selectedSectionNumber=t,this.notifyListeners()}getSelectedSection(e){return this.selectedCourses.get(e)?.selectedSectionNumber||null}getSelectedSectionObject(e){return this.selectedCourses.get(e)?.selectedSection||null}loadSelectedCourses(e){this.selectedCourses.clear(),e.forEach(t=>{if(t.selectedSection&&typeof t.selectedSection=="string"){const s=t.selectedSection,r=t.course.sections.find(n=>n.number===s)||null;t.selectedSection=r,t.selectedSectionNumber=s}else t.selectedSection&&!t.selectedSectionNumber&&(t.selectedSectionNumber=t.selectedSection.number);this.selectedCourses.set(t.course,t)}),this.notifyListeners()}validateCourseExists(e,t){return t?!0:(console.warn(`Course ${e.id} not found in selected courses`),!1)}notifyListeners(){const e=this.getSelectedCourses();this.listeners.forEach(t=>t(e))}setAllDepartments(e){this.allDepartments=e,this.populateAllSections()}populateAllSections(){this.allSections.clear();for(const e of this.allDepartments)for(const t of e.courses)for(const s of t.sections)this.allSections.add(s);console.log(`CourseManager: Populated ${this.allSections.size} sections from ${this.allDepartments.length} departments`)}getAllSections(){return Array.from(this.allSections)}getAllSectionsForCourse(e){return e.sections}getAllSectionsForDepartment(e){const t=this.allDepartments.find(r=>r.abbreviation===e);if(!t)return[];const s=[];for(const r of t.courses)s.push(...r.sections);return s}getAllDepartments(){return this.allDepartments}reconstructSectionObjects(){console.log("=== RECONSTRUCTING SECTION OBJECTS ===");let e=0,t=0;this.selectedCourses.forEach((s,r)=>{if(s.selectedSectionNumber&&!s.selectedSection){console.log(`Reconstructing section for ${r.department.abbreviation}${r.number}:`),console.log(`  Looking for section: ${s.selectedSectionNumber}`),console.log(`  Course has ${r.sections.length} sections:`,r.sections.map(o=>o.number));const n=r.sections.find(o=>o.number===s.selectedSectionNumber)||null;n?(s.selectedSection=n,e++,console.log(`  ✓ Successfully reconstructed section ${n.number}`)):(t++,console.log(`  ✗ Failed to find section ${s.selectedSectionNumber}`))}else s.selectedSection&&console.log(`Section already exists for ${r.department.abbreviation}${r.number}: ${s.selectedSection.number}`)}),console.log(`Reconstruction complete: ${e} succeeded, ${t} failed`),console.log(`=== END SECTION RECONSTRUCTION ===
`),e>0&&this.notifyListeners()}findCourseContainingSection(e){for(const t of this.allDepartments)for(const s of t.courses)if(s.sections.includes(e))return s}}class w{static isValidCourse(e){return e&&typeof e.id=="string"&&typeof e.number=="string"&&typeof e.name=="string"&&typeof e.description=="string"&&this.isValidDepartment(e.department)&&Array.isArray(e.sections)&&e.sections.every(t=>this.isValidSection(t))&&typeof e.minCredits=="number"&&typeof e.maxCredits=="number"}static isValidDepartment(e){return e&&typeof e.abbreviation=="string"&&typeof e.name=="string"&&(e.courses===void 0||Array.isArray(e.courses))}static isValidSection(e){return e&&typeof e.crn=="number"&&typeof e.number=="string"&&typeof e.seats=="number"&&typeof e.seatsAvailable=="number"&&typeof e.actualWaitlist=="number"&&typeof e.maxWaitlist=="number"&&typeof e.description=="string"&&typeof e.term=="string"&&Array.isArray(e.periods)&&e.periods.every(t=>this.isValidPeriod(t))}static isValidPeriod(e){return e&&typeof e.type=="string"&&typeof e.professor=="string"&&this.isValidTime(e.startTime)&&this.isValidTime(e.endTime)&&typeof e.location=="string"&&typeof e.building=="string"&&typeof e.room=="string"&&typeof e.seats=="number"&&typeof e.seatsAvailable=="number"&&typeof e.actualWaitlist=="number"&&typeof e.maxWaitlist=="number"&&e.days instanceof Set}static isValidTime(e){return e&&typeof e.hours=="number"&&typeof e.minutes=="number"&&typeof e.displayTime=="string"&&e.hours>=0&&e.hours<=23&&e.minutes>=0&&e.minutes<=59}static isValidSchedulePreferences(e){return e&&this.isValidTimeRange(e.preferredTimeRange)&&e.preferredDays instanceof Set&&typeof e.avoidBackToBackClasses=="boolean"}static isValidTimeRange(e){return e&&this.isValidTime(e.startTime)&&this.isValidTime(e.endTime)}static isValidSelectedCourse(e){return e&&this.isValidCourse(e.course)&&typeof e.isRequired=="boolean"}static isValidSchedule(e){return e&&typeof e.id=="string"&&typeof e.name=="string"&&Array.isArray(e.selectedCourses)&&e.selectedCourses.every(t=>this.isValidSelectedCourse(t))&&Array.isArray(e.generatedSchedules)&&this.isValidSchedulePreferences(e.preferences)}static sanitizeString(e){return e.replace(/<[^>]*>/g,"").trim()}static sanitizeCourseData(e){try{return this.isValidCourse(e)?{...e,name:this.sanitizeString(e.name),description:this.sanitizeString(e.description),sections:e.sections.map(t=>({...t,description:this.sanitizeString(t.description),periods:t.periods.map(s=>({...s,professor:this.sanitizeString(s.professor),location:this.sanitizeString(s.location),building:this.sanitizeString(s.building),room:this.sanitizeString(s.room)}))}))}:null}catch(t){return console.warn("Error sanitizing course data:",t),null}}static validateCourseId(e){return/^[A-Z]{2,4}-\d{3,4}$/.test(e)}static validateSectionNumber(e){return typeof e=="string"&&e.trim().length>0&&/^[\w\s\-/]+$/.test(e)}static validateEmail(e){return/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)}}class pe{constructor(e,t){this.courseManager=e||new fe,this.storageManager=t||new O,this.loadPersistedSelections(),this.setupPersistenceListener()}selectCourse(e,t=!1){if(!w.isValidCourse(e))throw new Error("Invalid course object provided");this.courseManager.addCourse(e,t)}unselectCourse(e){if(!w.isValidCourse(e))throw new Error("Invalid course object provided");this.courseManager.removeCourse(e)}toggleCourseSelection(e,t=!1){return this.isCourseSelected(e)?(this.unselectCourse(e),!1):(this.selectCourse(e,t),!0)}setSelectedSection(e,t){if(!w.isValidCourse(e))throw new Error("Invalid course object provided");if(t!==null&&!w.validateSectionNumber(t))throw new Error("Invalid sectionNumber provided");this.courseManager.setSelectedSection(e,t)}getSelectedSection(e){if(!w.isValidCourse(e))throw new Error("Invalid course object provided");return this.courseManager.getSelectedSection(e)}getSelectedSectionObject(e){if(!w.isValidCourse(e))throw new Error("Invalid course object provided");return this.courseManager.getSelectedSectionObject(e)}isCourseSelected(e){return w.isValidCourse(e)?this.courseManager.isSelected(e):!1}getSelectedCourses(){return this.courseManager.getSelectedCourses()}getSelectedCourse(e){if(w.isValidCourse(e))return this.courseManager.getSelectedCourse(e)}clearAllSelections(){this.courseManager.clearAll(),this.storageManager.clearSelectedCourses()}getSelectedCoursesCount(){return this.getSelectedCourses().length}getSelectedCourseIds(){return this.getSelectedCourses().map(e=>e.course.id)}onSelectionChange(e){this.courseManager.onSelectionChange(e)}offSelectionChange(e){this.courseManager.offSelectionChange(e)}loadPersistedSelections(){const e=this.storageManager.loadSelectedCourses();e.length>0&&this.courseManager.loadSelectedCourses(e)}setupPersistenceListener(){this.courseManager.onSelectionChange(e=>{this.storageManager.saveSelectedCourses(e)})}persistSelections(){const e=this.getSelectedCourses();this.storageManager.saveSelectedCourses(e)}exportSelections(){const e=this.getSelectedCourses();return JSON.stringify({version:"1.0",timestamp:new Date().toISOString(),selectedCourses:e},null,2)}importSelections(e){try{const t=JSON.parse(e);return t.selectedCourses&&Array.isArray(t.selectedCourses)?(this.courseManager.loadSelectedCourses(t.selectedCourses),!0):!1}catch(t){return console.error("Failed to import selections:",t),!1}}setAllDepartments(e){this.courseManager.setAllDepartments(e)}getAllSections(){return this.courseManager.getAllSections()}getAllSectionsForCourse(e){return this.courseManager.getAllSectionsForCourse(e)}getAllSectionsForDepartment(e){return this.courseManager.getAllSectionsForDepartment(e)}findCourseById(e){for(const t of this.courseManager.getAllDepartments()){const s=t.courses.find(r=>r.id===e);if(s)return s}}unselectCourseById(e){const t=this.findCourseById(e);t&&this.unselectCourse(t)}isCourseSelectedById(e){const t=this.findCourseById(e);return t?this.isCourseSelected(t):!1}setSelectedSectionById(e,t){const s=this.findCourseById(e);s&&this.setSelectedSection(s,t)}getSelectedSectionById(e){const t=this.findCourseById(e);return t?this.getSelectedSection(t):null}getSelectedCourseById(e){const t=this.findCourseById(e);return t?this.getSelectedCourse(t):void 0}reconstructSectionObjects(){this.courseManager.reconstructSectionObjects()}}var k=(m=>(m.TIME_OVERLAP="time_overlap",m))(k||{});class ge{constructor(){this.conflictCache=new Map}detectConflicts(e){const t=[];for(let s=0;s<e.length;s++)for(let r=s+1;r<e.length;r++){const n=this.getCacheKey(e[s],e[r]);let o=this.conflictCache.get(n);o||(o=this.checkSectionConflicts(e[s],e[r]),this.conflictCache.set(n,o)),t.push(...o)}return t}checkSectionConflicts(e,t){const s=[];for(const r of e.periods)for(const n of t.periods){const o=this.checkPeriodConflict(r,n,e,t);o&&s.push(o)}return s}checkPeriodConflict(e,t,s,r){const n=this.getSharedDays(e.days,t.days);return n.length===0?null:this.hasTimeOverlap(e,t)?{section1:s,section2:r,conflictType:k.TIME_OVERLAP,description:`Time overlap on ${n.join(", ")}: ${e.startTime.displayTime}-${e.endTime.displayTime} conflicts with ${t.startTime.displayTime}-${t.endTime.displayTime}`}:null}getSharedDays(e,t){return Array.from(new Set([...e].filter(s=>t.has(s))))}hasTimeOverlap(e,t){const s=this.timeToMinutes(e.startTime),r=this.timeToMinutes(e.endTime),n=this.timeToMinutes(t.startTime),o=this.timeToMinutes(t.endTime);return s<o&&n<r}timeToMinutes(e){return e.hours*60+e.minutes}isValidSchedule(e){return this.detectConflicts(e).length===0}clearCache(){this.conflictCache.clear()}getCacheKey(e,t){const s=`${e.crn}-${t.crn}`,r=`${t.crn}-${e.crn}`;return s<r?s:r}}class Se{constructor(){this.modals=new Map,this.currentZIndex=1e3}showModal(e,t){this.hideModal(e),t.style.zIndex=this.currentZIndex.toString(),this.currentZIndex+=10,this.modals.set(e,t),document.body.appendChild(t),requestAnimationFrame(()=>{t.classList.add("show")})}hideModal(e){const t=this.modals.get(e);t&&(t.classList.add("hide"),setTimeout(()=>{t.parentNode&&t.parentNode.removeChild(t),this.modals.delete(e)},200))}hideAllModals(){Array.from(this.modals.keys()).forEach(t=>this.hideModal(t))}isModalOpen(e){return this.modals.has(e)}getOpenModals(){return Array.from(this.modals.keys())}generateId(){return`modal-${Date.now()}-${Math.random().toString(36).substr(2,9)}`}setupModalBehavior(e,t,s={}){const{closeOnBackdrop:r=!0,closeOnEscape:n=!0}=s;if(r&&e.addEventListener("click",o=>{o.target===e&&this.hideModal(t)}),n){const o=i=>{i.key==="Escape"&&(this.hideModal(t),document.removeEventListener("keydown",o))};document.addEventListener("keydown",o)}}}class ve{constructor(){this.allDepartments=[],this.selectedDepartment=null,this.departmentCategories={BB:"Science",BCB:"Science",CH:"Science",CS:"Science",DS:"Science",GE:"Science",IMGD:"Science",MA:"Science",MTE:"Science",PTE:"Science",NE:"Science",PH:"Science",AE:"Engineering",AR:"Engineering",ARE:"Engineering",BME:"Engineering",CE:"Engineering",CHE:"Engineering",ECE:"Engineering",ES:"Engineering",FP:"Engineering",ME:"Engineering",MFE:"Engineering",MSE:"Engineering",NUE:"Engineering",RBE:"Engineering",SYE:"Engineering",BUS:"Business & Management",ECON:"Business & Management",MIS:"Business & Management",OIE:"Business & Management",EN:"Humanities & Arts",HI:"Humanities & Arts",HU:"Humanities & Arts",MU:"Humanities & Arts",RE:"Humanities & Arts",SP:"Humanities & Arts",TH:"Humanities & Arts",WR:"Humanities & Arts",GOV:"Social Sciences",PSY:"Social Sciences",SOC:"Social Sciences",SS:"Social Sciences"}}setAllDepartments(e){this.allDepartments=e}getSelectedDepartment(){return this.selectedDepartment}selectDepartment(e){const t=this.allDepartments.find(r=>r.abbreviation===e);if(!t)return null;this.selectedDepartment=t;const s=document.querySelector(".content-header h2");return s&&(s.textContent=`${t.name} Courses`),t}displayDepartments(){const e=document.getElementById("department-list");if(!e)return;const t=this.groupDepartmentsByCategory();let s="";Object.entries(t).forEach(([r,n])=>{n.length!==0&&(s+=`
                <div class="department-category">
                    <div class="category-header">${r}</div>
                    <div class="department-list">
            `,n.forEach(o=>{const i=o.courses.length;s+=`
                    <div class="department-item" data-dept-id="${o.abbreviation}">
                        ${o.name} (${i})
                    </div>
                `}),s+=`
                    </div>
                </div>
            `)}),e.innerHTML=s}groupDepartmentsByCategory(){const e={Science:[],Engineering:[],"Business & Management":[],"Humanities & Arts":[],"Social Sciences":[],Other:[]};return this.allDepartments.forEach(t=>{const s=this.departmentCategories[t.abbreviation]||"Other";e[s].push(t)}),Object.keys(e).forEach(t=>{e[t].sort((s,r)=>s.name.localeCompare(r.name))}),e}handleDepartmentClick(e){const t=this.selectDepartment(e);document.querySelectorAll(".department-item").forEach(r=>{r.classList.remove("active")});const s=document.querySelector(`[data-dept-id="${e}"]`);return s&&s.classList.add("active"),t}clearDepartmentSelection(){this.selectedDepartment=null,document.querySelectorAll(".department-item").forEach(e=>{e.classList.remove("active")})}}class ye{constructor(e){this.allDepartments=[],this.selectedCourse=null,this.elementToCourseMap=new WeakMap,this.courseSelectionService=e}setAllDepartments(e){this.allDepartments=e}getSelectedCourse(){return this.selectedCourse}displayCourses(e,t){t==="grid"?this.displayCoursesGrid(e):this.displayCoursesList(e)}displayCoursesList(e){const t=document.getElementById("course-container");if(!t)return;if(e.length===0){t.innerHTML='<div class="empty-state">No courses found in this department.</div>';return}const s=e.sort((o,i)=>o.number.localeCompare(i.number));let r='<div class="course-list">';s.forEach(o=>{const i=this.courseHasWarning(o);o.sections.map(a=>a.number).filter(Boolean);const c=this.courseSelectionService.isCourseSelected(o);r+=`
                <div class="course-item ${c?"selected":""}">
                    <div class="course-header">
                        <button class="course-select-btn ${c?"selected":""}" title="${c?"Remove from selection":"Add to selection"}">
                            ${c?"✓":"+"}
                        </button>
                        <div class="course-code">${o.department.abbreviation}${o.number}</div>
                        <div class="course-details">
                            <div class="course-name">
                                ${o.name}
                                ${i?'<span class="warning-icon">⚠</span>':""}
                            </div>
                            <div class="course-sections">
                                ${o.sections.map(a=>`<span class="section-badge ${a.seatsAvailable<=0?"full":""}" data-section="${a.number}">${a.number}</span>`).join("")}
                            </div>
                        </div>
                    </div>
                </div>
            `}),r+="</div>",t.innerHTML=r,t.querySelectorAll(".course-item").forEach((o,i)=>{this.elementToCourseMap.set(o,s[i])})}displayCoursesGrid(e){const t=document.getElementById("course-container");if(!t)return;if(e.length===0){t.innerHTML='<div class="empty-state">No courses found in this department.</div>';return}const s=e.sort((o,i)=>o.number.localeCompare(i.number));let r='<div class="course-grid">';s.forEach(o=>{const i=this.courseHasWarning(o),c=this.courseSelectionService.isCourseSelected(o),a=o.minCredits===o.maxCredits?o.minCredits:`${o.minCredits}-${o.maxCredits}`;r+=`
                <div class="course-card ${c?"selected":""}">
                    <div class="course-card-header">
                        <div class="course-code">${o.department.abbreviation}${o.number}</div>
                        <button class="course-select-btn ${c?"selected":""}" title="${c?"Remove from selection":"Add to selection"}">
                            ${c?"✓":"+"}
                        </button>
                    </div>
                    <div class="course-title">
                        ${o.name}
                        ${i?'<span class="warning-icon">⚠</span>':""}
                    </div>
                    <div class="course-info">
                        <span class="course-credits">${a} credits</span>
                        <span class="course-sections-count">${o.sections.length} section${o.sections.length!==1?"s":""}</span>
                    </div>
                </div>
            `}),r+="</div>",t.innerHTML=r,t.querySelectorAll(".course-card").forEach((o,i)=>{this.elementToCourseMap.set(o,s[i])})}courseHasWarning(e){return e.sections.every(t=>t.seatsAvailable<=0)}handleSearch(e,t){if(!e.trim())return t?t.courses:[];const s=[];this.allDepartments.forEach(o=>{s.push(...o.courses)});const r=s.filter(o=>o.name.toLowerCase().includes(e.toLowerCase())||o.number.toLowerCase().includes(e.toLowerCase())||o.id.toLowerCase().includes(e.toLowerCase())),n=document.querySelector(".content-header h2");return n&&(n.textContent=`Search Results (${r.length})`),r}selectCourse(e){const t=this.elementToCourseMap.get(e);return t?(this.selectedCourse=t,this.displayCourseDescription(t),document.querySelectorAll(".course-item, .course-card").forEach(s=>{s.classList.remove("active")}),e.classList.add("active"),t):null}selectCourseById(e){if(!this.courseSelectionService.findCourseById(e))return null;const s=document.querySelectorAll(".course-item, .course-card");for(const r of s)if(this.elementToCourseMap.get(r)?.id===e)return this.selectCourse(r);return null}toggleCourseSelection(e){const t=this.elementToCourseMap.get(e);if(!t)return!1;const s=this.courseSelectionService.toggleCourseSelection(t);return this.updateCourseSelectionUI(e,s),s}toggleCourseSelectionById(e){if(!this.courseSelectionService.findCourseById(e))return!1;const s=document.querySelectorAll(".course-item, .course-card");for(const r of s)if(this.elementToCourseMap.get(r)?.id===e)return this.toggleCourseSelection(r);return!1}updateCourseSelectionUI(e,t){const s=e.querySelector(".course-select-btn");s&&(t?(e.classList.add("selected"),s.textContent="✓",s.classList.add("selected")):(e.classList.remove("selected"),s.textContent="+",s.classList.remove("selected")))}refreshCourseSelectionUI(){document.querySelectorAll(".course-item, .course-card").forEach(e=>{const t=this.elementToCourseMap.get(e);if(t){const s=this.courseSelectionService.isCourseSelected(t);this.updateCourseSelectionUI(e,s)}})}displayCourseDescription(e){const t=document.getElementById("course-description");if(!t)return;const s=`
            <div class="course-info">
                <div class="course-title">${e.name}</div>
                <div class="course-code">${e.department.abbreviation}${e.number} (${e.minCredits===e.maxCredits?e.minCredits:`${e.minCredits}-${e.maxCredits}`} credits)</div>
            </div>
            <div class="course-description-text">${e.description}</div>
        `;t.innerHTML=s}clearCourseDescription(){const e=document.getElementById("course-description");e&&(e.innerHTML='<div class="empty-state">Select a course to view description</div>')}clearCourseSelection(){this.selectedCourse=null,this.clearCourseDescription()}displaySelectedCourses(){const e=document.getElementById("selected-courses-list"),t=document.getElementById("selected-count");if(!e||!t)return;const s=this.courseSelectionService.getSelectedCourses();if(t.textContent=`(${s.length})`,s.length===0){e.innerHTML='<div class="empty-state">No courses selected yet</div>';return}const r=s.sort((i,c)=>{const a=i.course.department.abbreviation.localeCompare(c.course.department.abbreviation);return a!==0?a:i.course.number.localeCompare(c.course.number)});let n="";r.forEach(i=>{const c=i.course,a=c.minCredits===c.maxCredits?`${c.minCredits} credits`:`${c.minCredits}-${c.maxCredits} credits`;n+=`
                <div class="selected-course-item">
                    <div class="selected-course-info">
                        <div class="selected-course-code">${c.department.abbreviation}${c.number}</div>
                        <div class="selected-course-name">${c.name}</div>
                        <div class="selected-course-credits">${a}</div>
                    </div>
                    <button class="course-remove-btn" title="Remove from selection">
                        ×
                    </button>
                </div>
            `}),e.innerHTML=n,e.querySelectorAll(".course-remove-btn").forEach((i,c)=>{this.elementToCourseMap.set(i,r[c].course)})}getCourseFromElement(e){return this.elementToCourseMap.get(e)}}const u=class u{static timeToGridRow(e){return u.timeToGridRowStart(e)}static timeToGridRowStart(e){const t=e.hours*60+e.minutes,s=u.START_HOUR*60,r=t-s,n=Math.floor(r/30);return Math.max(0,Math.min(n,u.TOTAL_TIME_SLOTS-1))}static timeToGridRowEnd(e){const t=e.hours*60+e.minutes,s=u.START_HOUR*60,r=t-s,n=Math.ceil(r/30),o=Math.max(0,Math.min(n,u.TOTAL_TIME_SLOTS-1));return r%30!==0&&console.log(`Rounded UP: ${e.hours}:${e.minutes.toString().padStart(2,"0")} -> slot ${n} (${r} min = ${r/30} slots)`),o}static dayToGridColumn(e){return u.DAYS_ORDER.indexOf(e)}static calculateDuration(e,t){const s=u.timeToGridRow(e),r=u.timeToGridRow(t);return Math.max(1,r-s)}static isTimeInBounds(e){return e.hours>=u.START_HOUR&&e.hours<u.END_HOUR}static formatTime(e){if(e.displayTime)return e.displayTime;const t=e.hours===0?12:e.hours>12?e.hours-12:e.hours,s=e.hours>=12?"PM":"AM",r=e.minutes.toString().padStart(2,"0");return`${t}:${r} ${s}`}static formatTimeRange(e,t){const s=u.formatTime(e),r=u.formatTime(t);return e.hours<12&&t.hours<12?`${s.replace(" AM","")}-${r}`:e.hours>=12&&t.hours>=12?`${s.replace(" PM","")}-${r}`:`${s}-${r}`}static formatDays(e){const t={[l.MONDAY]:"M",[l.TUESDAY]:"T",[l.WEDNESDAY]:"W",[l.THURSDAY]:"R",[l.FRIDAY]:"F",[l.SATURDAY]:"S",[l.SUNDAY]:"U"};return u.DAYS_ORDER.filter(s=>e.has(s)).map(s=>t[s]).join("")}static generateTimeLabels(){const e=[];for(let t=0;t<u.TOTAL_TIME_SLOTS;t++){const s=Math.floor(t/u.SLOTS_PER_HOUR)+u.START_HOUR,r=t%u.SLOTS_PER_HOUR*30;e.push(u.formatTime({hours:s,minutes:r,displayTime:""}))}return e}static getDayName(e){return{[l.MONDAY]:"Monday",[l.TUESDAY]:"Tuesday",[l.WEDNESDAY]:"Wednesday",[l.THURSDAY]:"Thursday",[l.FRIDAY]:"Friday",[l.SATURDAY]:"Saturday",[l.SUNDAY]:"Sunday"}[e]}static getDayAbbr(e){return{[l.MONDAY]:"Mon",[l.TUESDAY]:"Tue",[l.WEDNESDAY]:"Wed",[l.THURSDAY]:"Thu",[l.FRIDAY]:"Fri",[l.SATURDAY]:"Sat",[l.SUNDAY]:"Sun"}[e]}};u.START_HOUR=7,u.END_HOUR=19,u.TOTAL_HOURS=12,u.SLOTS_PER_HOUR=2,u.TOTAL_TIME_SLOTS=u.TOTAL_HOURS*u.SLOTS_PER_HOUR,u.DAYS_ORDER=[l.MONDAY,l.TUESDAY,l.WEDNESDAY,l.THURSDAY,l.FRIDAY,l.SATURDAY,l.SUNDAY];let y=u;class be{constructor(e){this.sectionInfoModalController=null,this.elementToCourseMap=new WeakMap,this.courseSelectionService=e}setSectionInfoModalController(e){this.sectionInfoModalController=e}setStatePreserver(e){this.statePreserver=e}displayScheduleSelectedCourses(){const e=document.getElementById("schedule-selected-courses"),t=document.getElementById("schedule-selected-count");if(!e||!t)return;const s=this.statePreserver?.preserve(),r=this.courseSelectionService.getSelectedCourses();if(t.textContent=`(${r.length})`,r.length===0){e.innerHTML='<div class="empty-state">No courses selected yet</div>';return}const n=r.sort((h,d)=>{const f=h.course.department.abbreviation.localeCompare(d.course.department.abbreviation);return f!==0?f:h.course.number.localeCompare(d.course.number)});let o="";n.forEach(h=>{const d=h.course,f=d.minCredits===d.maxCredits?`${d.minCredits} credits`:`${d.minCredits}-${d.maxCredits} credits`,p={};d.sections.forEach(v=>{p[v.term]||(p[v.term]=[]),p[v.term].push(v)}),o+=`
                <div class="schedule-course-item collapsed" >
                    <div class="schedule-course-header dropdown-trigger" >
                        <div class="schedule-course-info">
                            <div class="schedule-course-code">${d.department.abbreviation}${d.number}</div>
                            <div class="schedule-course-name">${d.name}</div>
                            <div class="schedule-course-credits">${f}</div>
                        </div>
                        <div class="header-controls">
                            <span class="dropdown-arrow">▼</span>
                            <button class="course-remove-btn"  title="Remove from selection">
                                ×
                            </button>
                        </div>
                    </div>
                    <div class="schedule-sections-container">
            `,Object.keys(p).sort().forEach(v=>{o+=`<div class="term-sections" data-term="${v}">`,o+=`<div class="term-label">${v} Term</div>`,p[v].forEach(C=>{const $=h.selectedSectionNumber===C.number,A=$?"selected":"",D=[...C.periods].sort((g,x)=>{const E=I=>{const T=I.toLowerCase();return T.includes("lec")||T.includes("lecture")?1:T.includes("lab")?2:T.includes("dis")||T.includes("discussion")||T.includes("rec")?3:4};return E(g.type)-E(x.type)});o+=`
                        <div class="section-option ${A}"  data-section="${C.number}">
                            <div class="section-info">
                                <div class="section-number">${C.number}</div>
                                <div class="section-periods">`,D.forEach((g,x)=>{const E=y.formatTimeRange(g.startTime,g.endTime),I=y.formatDays(g.days),T=this.getPeriodTypeLabel(g.type);o+=`
                            <div class="period-info" data-period-type="${g.type.toLowerCase()}">
                                <div class="period-header">
                                    <span class="period-type-label">${T}</span>
                                    <span class="period-schedule">${I} ${E}</span>
                                </div>
                            </div>
                        `}),o+=`
                                </div>
                            </div>
                            <button class="section-select-btn ${A}"  data-section="${C.number}">
                                ${$?"✓":"+"}
                            </button>
                        </div>
                    `}),o+="</div>"}),o+=`
                    </div>
                </div>
            `}),e.innerHTML=o;const i=e.querySelectorAll(".schedule-course-item"),c=e.querySelectorAll(".course-remove-btn");i.forEach((h,d)=>{const f=n[d]?.course;this.elementToCourseMap.set(h,f)}),c.forEach((h,d)=>{const f=n[d]?.course;this.elementToCourseMap.set(h,f)}),e.querySelectorAll(".section-select-btn").forEach(h=>{const d=h.closest(".schedule-course-item");if(d){const f=Array.from(i).indexOf(d);if(f>=0&&f<n.length){const p=n[f].course;this.elementToCourseMap.set(h,p)}}}),s&&setTimeout(()=>{this.statePreserver?.restore(s)},0)}handleSectionSelection(e,t){this.courseSelectionService.getSelectedSection(e)===t?this.courseSelectionService.setSelectedSection(e,null):this.courseSelectionService.setSelectedSection(e,t)}updateSectionButtonStates(e,t){let s=null;if(document.querySelectorAll(".schedule-course-item").forEach(o=>{const i=this.elementToCourseMap.get(o);i&&i.id===e.id&&(s=o)}),!s)return;const r=s.querySelectorAll(".section-select-btn"),n=s.querySelectorAll(".section-option");r.forEach(o=>{o.dataset.section===t?(o.classList.add("selected"),o.textContent="✓"):(o.classList.remove("selected"),o.textContent="+")}),n.forEach(o=>{o.dataset.section===t?o.classList.add("selected"):o.classList.remove("selected")})}renderScheduleGrids(){const e=this.courseSelectionService.getSelectedCourses(),t=["A","B","C","D"];console.log(`
=== RENDER SCHEDULE GRIDS ===`),console.log(`Processing ${e.length} selected courses for terms: ${t.join(", ")}`),t.forEach(s=>{const r=document.getElementById(`schedule-grid-${s}`);if(!r)return;const n=e.filter(o=>{if(!(o.selectedSection!==null))return!1;console.log(`  Checking course ${o.course.department.abbreviation}${o.course.number} with term "${o.selectedSection.term}" against grid term "${s}"`);const c=this.extractTermLetter(o.selectedSection.term,o.selectedSection.number),a=c===s;return console.log(`    Extracted term letter: "${c}" from term:"${o.selectedSection.term}" section:"${o.selectedSection.number}"`),a});if(console.log(`Term ${s}: ${n.length} courses`),n.forEach(o=>{console.log(`  ${o.course.department.abbreviation}${o.course.number} (${o.selectedSection.periods.length} periods)`)}),n.length===0){const o=e.filter(i=>!i.selectedSection);this.renderEmptyGrid(r,s,o.length>0);return}this.renderPopulatedGrid(r,n,s)}),console.log(`=== END RENDER SCHEDULE GRIDS ===
`)}renderEmptyGrid(e,t,s=!1){const r=s?`No sections selected for ${t} term<br><small>Select specific sections in the left panel to see schedule</small>`:`No classes scheduled for ${t} term`;e.innerHTML=`
            <div class="empty-schedule">
                <div class="empty-message">${r}</div>
            </div>
        `,e.classList.add("empty")}renderPopulatedGrid(e,t,s){e.classList.remove("empty");const r=[l.MONDAY,l.TUESDAY,l.WEDNESDAY,l.THURSDAY,l.FRIDAY],n=y.TOTAL_TIME_SLOTS;let o="";o+='<div class="time-label"></div>',r.forEach(i=>{o+=`<div class="day-header">${y.getDayAbbr(i)}</div>`});for(let i=0;i<n;i++){const c=Math.floor(i/y.SLOTS_PER_HOUR)+y.START_HOUR,a=i%y.SLOTS_PER_HOUR*30,h=y.formatTime({hours:c,minutes:a,displayTime:""});o+=`<div class="time-label">${h}</div>`,r.forEach(d=>{const f=this.getCellContent(t,d,i);o+=`<div class="schedule-cell ${f.classes}" data-day="${d}" data-slot="${i}" style="position: relative;">${f.content}</div>`})}e.innerHTML=o,this.addSectionBlockEventListeners(e)}getCellContent(e,t,s){const r=[],n=s<12&&e.length>0;if(n&&e.length>0){const p=Math.floor(s/2)+7,L=s%2*30;console.log(`
--- getCellContent: ${t} ${p}:${L.toString().padStart(2,"0")} (slot ${s}) ---`),console.log(`Checking ${e.length} courses for this time slot`)}for(const p of e){if(!p.selectedSection)continue;const L=p.selectedSection,v=L.periods.filter(g=>g.days.has(t));n&&v.length>0&&(console.log(`  Course ${p.course.department.abbreviation}${p.course.number} has ${v.length} periods on ${t}:`),v.forEach(g=>{console.log(`    ${g.type}: ${g.startTime.hours}:${g.startTime.minutes.toString().padStart(2,"0")}-${g.endTime.hours}:${g.endTime.minutes.toString().padStart(2,"0")}`)}));let C=!1,$=1/0,A=-1,D=!1;for(const g of v){const x=y.timeToGridRowStart(g.startTime),E=y.timeToGridRowEnd(g.endTime);n&&console.log(`    Checking period ${g.type}: slots ${x}-${E} vs current slot ${s}`),s>=x&&s<E&&(C=!0,$=Math.min($,x),A=Math.max(A,E),n&&console.log(`      ✓ MATCHES! Period occupies slot ${s}`))}C&&(D=s===$,n&&console.log(`    Course ${p.course.department.abbreviation}${p.course.number} occupies slot, isFirstSlot: ${D}`),r.push({course:p,section:L,periodsOnThisDay:v,startSlot:$,endSlot:A,isFirstSlot:D}))}if(r.length===0)return{content:"",classes:""};const o=r.length>1,i=r[0],c=this.getCourseColor(i.course.course.id),a=i.endSlot-i.startSlot,h=a*30;console.log(`Course ${i.course.course.department.abbreviation}${i.course.course.number} should span ${a} rows (${h}px) from slot ${i.startSlot} to ${i.endSlot}`);const d=i.isFirstSlot?`
            <div class="section-block ${o?"conflict":""}" 
                 data-course-id="${i.course.course.id}"
                 data-section-number="${i.course.selectedSectionNumber||""}"
                 data-selected-course-index="${i.courseIndex||0}"
                 style="
                background-color: ${c}; 
                height: ${h}px;
                width: 100%;
                position: absolute;
                top: 0;
                left: 0;
                z-index: 10;
                border: 1px solid rgba(0,0,0,0.2);
                border-radius: 3px;
                box-sizing: border-box;
                display: flex;
                align-items: center;
                justify-content: center;
                text-align: center;
                font-weight: bold;
                font-size: 0.8rem;
                color: white;
                text-shadow: 1px 1px 1px rgba(0,0,0,0.3);
                cursor: pointer;
            ">
                ${i.course.course.department.abbreviation}${i.course.course.number}
            </div>
        `:"",f=i.isFirstSlot?`occupied section-start ${o?"has-conflict":""}`:"";return{content:d,classes:f}}formatSectionPeriods(e){if(e.length===0)return"";const t={};for(const o of e){const i=this.getPeriodTypeLabel(o.type);t[i]||(t[i]=[]),t[i].push(o)}const s=[],r=["LEC","LAB","DIS","REC","SEM","STU","CONF"],n=Object.keys(t).sort((o,i)=>{const c=r.indexOf(o),a=r.indexOf(i);return(c===-1?999:c)-(a===-1?999:a)});for(const o of n){const c=t[o].map(a=>y.formatTimeRange(a.startTime,a.endTime)).join(", ");s.push(`<div class="period-type-info">
                <span class="period-type">${o}</span>
                <span class="period-times">${c}</span>
            </div>`)}return s.join("")}getCourseColor(e){const t=["#4CAF50","#2196F3","#FF9800","#9C27B0","#F44336","#00BCD4","#795548","#607D8B","#3F51B5","#E91E63"];let s=0;for(let r=0;r<e.length;r++)s=e.charCodeAt(r)+((s<<5)-s);return t[Math.abs(s)%t.length]}getPeriodTypeLabel(e){const t=e.toLowerCase();return t.includes("lec")||t.includes("lecture")?"LEC":t.includes("lab")?"LAB":t.includes("dis")||t.includes("discussion")?"DIS":t.includes("rec")||t.includes("recitation")?"REC":t.includes("sem")||t.includes("seminar")?"SEM":t.includes("studio")?"STU":t.includes("conference")||t.includes("conf")?"CONF":e.substring(0,Math.min(4,e.length)).toUpperCase()}getPeriodTypeClass(e){const t=e.toLowerCase();return t.includes("lec")||t.includes("lecture")?"period-lecture":t.includes("lab")?"period-lab":t.includes("dis")||t.includes("discussion")?"period-discussion":t.includes("rec")||t.includes("recitation")?"period-recitation":t.includes("sem")||t.includes("seminar")?"period-seminar":t.includes("studio")?"period-studio":t.includes("conference")||t.includes("conf")?"period-conference":"period-other"}getCourseFromElement(e){return this.elementToCourseMap.get(e)}extractTermLetter(e,t){if(t){const s=t.match(/^([ABCD])/i);if(s)return s[1].toUpperCase()}if(e){const s=e.match(/\b([ABCD])\s+Term/i);if(s)return s[1].toUpperCase()}return"A"}addSectionBlockEventListeners(e){e.addEventListener("click",t=>{const r=t.target.closest(".section-block");if(!r)return;const n=r.dataset.courseId,o=r.dataset.sectionNumber;n&&o&&(t.stopPropagation(),this.showSectionInfoModal(n,o))})}showSectionInfoModal(e,t){if(!this.sectionInfoModalController){console.warn("Section info modal controller not available");return}const r=this.courseSelectionService.getSelectedCourses().find(c=>c.course.id===e);if(!r||!r.selectedSection){console.warn("Course or section not found:",e,t);return}const n=r.course,o=r.selectedSection,i={courseCode:`${n.department.abbreviation}${n.number}`,courseName:n.name,section:o,course:n};this.sectionInfoModalController.show(i)}}class Ce{constructor(e){this.modalService=e}show(e){const t=this.modalService.generateId(),s=this.createModalElement(t,e);return this.modalService.showModal(t,s),this.modalService.setupModalBehavior(s,t),t}createModalElement(e,t){const s=document.createElement("div");s.className="modal-backdrop",s.id=e;const r=document.createElement("style");r.textContent=this.getModalCSS(),s.appendChild(r),s.innerHTML+=`
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">${t.courseCode} - ${t.courseName}</h3>
                        <button class="modal-close" onclick="document.getElementById('${e}').click()">×</button>
                    </div>
                    <div class="modal-body">
                        ${this.generateModalBody(t)}
                    </div>
                    <div class="modal-footer">
                        <button class="modal-btn btn-primary" onclick="document.getElementById('${e}').click()">Close</button>
                    </div>
                </div>
            </div>
        `;const n=s.querySelector(".modal-dialog");return n&&n.addEventListener("click",o=>{o.stopPropagation()}),s}generateModalBody(e){const t=e.section.seatsAvailable>0?`${e.section.seatsAvailable} seats available`:"Full",s=e.section.maxWaitlist>0?`Waitlist: ${e.section.actualWaitlist}/${e.section.maxWaitlist}`:"",r=e.section.periods.map(n=>{const i=Array.from(n.days).sort().join(", ").toUpperCase(),c=`${n.startTime.displayTime} - ${n.endTime.displayTime}`,a=n.building&&n.room?`${n.building} ${n.room}`:n.location||"TBA";return`
                <div class="period-info">
                    <div class="period-type">${this.getPeriodTypeLabel(n.type)}</div>
                    <div class="period-schedule">
                        <div>${i} ${c}</div>
                        <div class="period-location">${a}</div>
                    </div>
                </div>
            `}).join("");return`
            <div class="section-modal-content">
                <div class="section-basic-info">
                    <div class="section-detail"><strong>Section:</strong> ${e.section.number}</div>
                    <div class="section-detail"><strong>CRN:</strong> ${e.section.crn}</div>
                    <div class="section-detail"><strong>Term:</strong> ${e.section.term}</div>
                    <div class="section-detail"><strong>Credits:</strong> ${e.course.minCredits===e.course.maxCredits?e.course.minCredits:`${e.course.minCredits}-${e.course.maxCredits}`}</div>
                </div>
                
                <div class="section-enrollment ${e.section.seatsAvailable>0?"":"full"}">
                    <div class="enrollment-status ${e.section.seatsAvailable>0?"available":"full"}">
                        ${t}
                    </div>
                    ${s?`<div class="waitlist-info">${s}</div>`:""}
                </div>
                
                <div class="section-meetings">
                    <h4>Meeting Times</h4>
                    ${r}
                </div>
                
                ${e.section.note?`
                    <div class="section-notes">
                        <h4>Notes</h4>
                        <p>${e.section.note}</p>
                    </div>
                `:""}
            </div>
        `}getPeriodTypeLabel(e){const t=e.toLowerCase();return t.includes("lec")||t.includes("lecture")?"LEC":t.includes("lab")?"LAB":t.includes("dis")||t.includes("discussion")?"DIS":t.includes("rec")||t.includes("recitation")?"REC":t.includes("sem")||t.includes("seminar")?"SEM":t.includes("studio")?"STU":t.includes("conference")||t.includes("conf")?"CONF":e.substring(0,Math.min(4,e.length)).toUpperCase()}getModalCSS(){return`
            .modal-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 1rem;
                opacity: 0;
                transition: var(--effect-transition);
                cursor: pointer;
            }

            .modal-backdrop.show {
                opacity: 1;
            }

            .modal-backdrop.hide {
                opacity: 0;
            }

            .modal-dialog {
                background: var(--color-surface);
                border-radius: var(--effect-border-radius-large);
                box-shadow: var(--effect-shadow-hover);
                max-width: 600px;
                width: 100%;
                max-height: 90vh;
                overflow: hidden;
                transform: scale(0.9);
                transition: var(--effect-transition);
                cursor: default;
            }

            .modal-backdrop.show .modal-dialog {
                transform: scale(1);
            }

            .modal-backdrop.hide .modal-dialog {
                transform: scale(0.9);
            }

            .modal-content {
                display: flex;
                flex-direction: column;
                max-height: 90vh;
            }

            .modal-header {
                padding: 1.5rem 1.5rem 1rem 1.5rem;
                display: flex;
                align-items: center;
                justify-content: space-between;
                border-bottom: 1px solid var(--color-border);
                background: linear-gradient(135deg, var(--color-primary), var(--color-primary-light));
                color: var(--color-text-inverse);
            }

            .modal-title {
                margin: 0;
                font-size: 1.4rem;
                font-weight: 600;
                color: var(--color-text-inverse);
                font-family: var(--font-family);
            }

            .modal-close {
                background: none;
                border: none;
                font-size: 1.5rem;
                color: rgba(255, 255, 255, 0.8);
                cursor: pointer;
                padding: 0;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: var(--effect-border-radius);
                transition: var(--effect-transition);
            }

            .modal-close:hover {
                background: rgba(255, 255, 255, 0.1);
                color: var(--color-text-inverse);
            }

            .modal-body {
                padding: 1.5rem;
                flex: 1;
                overflow-y: auto;
                background: var(--color-surface);
            }

            .section-modal-content {
                display: flex;
                flex-direction: column;
                gap: 1.25rem;
                max-width: 100%;
                margin: 0 auto;
                align-items: center;
            }

            .section-basic-info {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 0.75rem;
                padding: 1rem;
                background: rgba(172, 43, 55, 0.08);
                border: 1px solid var(--color-border);
                border-radius: var(--effect-border-radius);
                border-left: 4px solid var(--color-primary);
                box-shadow: var(--effect-shadow);
                width: 100%;
            }

            .section-detail {
                font-size: 0.9rem;
                color: var(--color-text);
                font-family: var(--font-family);
            }

            .section-detail strong {
                color: var(--color-primary);
                font-weight: 600;
            }

            .section-enrollment {
                padding: 1rem;
                background: rgba(172, 43, 55, 0.08);
                border: 1px solid var(--color-border);
                border-radius: var(--effect-border-radius);
                border-left: 4px solid var(--color-success);
                box-shadow: var(--effect-shadow);
                width: 100%;
            }

            .section-enrollment.full {
                background: rgba(172, 43, 55, 0.08);
                border-left-color: var(--color-error);
            }

            .enrollment-status {
                font-weight: 600;
                margin-bottom: 0.5rem;
                font-size: 1rem;
                font-family: var(--font-family);
            }

            .enrollment-status.available {
                color: var(--color-success);
            }

            .enrollment-status.full {
                color: var(--color-error);
            }

            .waitlist-info {
                font-size: 0.875rem;
                color: var(--color-text-secondary);
                margin-top: 0.25rem;
                font-family: var(--font-family);
            }

            .section-meetings {
                width: 100%;
            }

            .section-meetings h4 {
                margin: 0 0 1rem 0;
                font-size: 1.1rem;
                color: var(--color-text);
                padding-bottom: 0.5rem;
                border-bottom: 2px solid var(--color-border);
                font-family: var(--font-family);
            }

            .period-info {
                display: flex;
                gap: 1rem;
                padding: 1rem;
                background: var(--color-surface);
                border: 1px solid var(--color-border);
                border-radius: var(--effect-border-radius);
                margin-bottom: 0.75rem;
                box-shadow: var(--effect-shadow);
            }

            .period-type {
                background: linear-gradient(135deg, var(--color-primary), var(--color-primary-light));
                color: var(--color-text-inverse);
                padding: 0.4rem 0.8rem;
                border-radius: var(--effect-border-radius);
                font-size: 0.8rem;
                font-weight: 700;
                height: fit-content;
                min-width: 50px;
                text-align: center;
                box-shadow: var(--effect-shadow);
                font-family: var(--font-family);
            }

            .period-schedule {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 0.3rem;
                font-size: 0.875rem;
                font-family: var(--font-family);
                align-items: flex-start;
            }

            .period-schedule div {
                color: var(--color-text);
                font-weight: 500;
            }

            .period-location {
                color: var(--color-text-secondary);
                font-size: 0.8rem;
                font-weight: normal;
            }

            .section-notes {
                background: var(--color-background-alt);
                border: 1px solid var(--color-warning);
                border-radius: var(--effect-border-radius);
                padding: 1rem;
                width: 100%;
            }

            .section-notes h4 {
                margin: 0 0 0.5rem 0;
                font-size: 1rem;
                color: var(--color-warning);
                border: none;
                padding: 0;
                font-family: var(--font-family);
            }

            .section-notes p {
                margin: 0;
                font-size: 0.875rem;
                color: var(--color-text-secondary);
                line-height: 1.5;
                font-family: var(--font-family);
            }

            .modal-footer {
                padding: 1rem 1.5rem 1.5rem 1.5rem;
                display: flex;
                gap: 0.75rem;
                justify-content: flex-end;
                border-top: 1px solid var(--color-border);
                background: var(--color-background);
            }

            .modal-btn {
                padding: 0.6rem 1.25rem;
                border-radius: var(--effect-border-radius);
                font-weight: 600;
                font-size: 0.875rem;
                cursor: pointer;
                transition: var(--effect-transition);
                border: 1px solid;
                min-width: 100px;
                font-family: var(--font-family);
            }

            .btn-primary {
                background: linear-gradient(135deg, var(--color-primary), var(--color-primary-light));
                color: var(--color-text-inverse);
                border-color: var(--color-primary);
            }

            .btn-primary:hover {
                background: linear-gradient(135deg, var(--color-primary-hover), var(--color-primary));
                border-color: var(--color-primary-hover);
                transform: translateY(-1px);
                box-shadow: var(--effect-shadow-hover);
            }

            @media (max-width: 768px) {
                .modal-backdrop {
                    padding: 0.5rem;
                }
                
                .modal-dialog {
                    max-width: 100%;
                    margin: 0;
                }
                
                .modal-body {
                    padding: 1rem;
                }
                
                .section-basic-info {
                    grid-template-columns: 1fr;
                    padding: 0.75rem;
                }
                
                .period-info {
                    flex-direction: column;
                    gap: 0.75rem;
                }
                
                .period-type {
                    align-self: flex-start;
                    width: fit-content;
                }
                

                .modal-footer {
                    padding: 0.75rem 1rem 1rem 1rem;
                }
                
                .modal-btn {
                    width: 100%;
                }
            }
        `}}class Ee{constructor(e){this.modalService=e}show(e,t,s="info"){const r=this.modalService.generateId(),n=this.createModalElement(r,e,t,s);return this.modalService.showModal(r,n),this.modalService.setupModalBehavior(n,r),r}showInfo(e,t){return this.show(e,t,"info")}showWarning(e,t){return this.show(e,t,"warning")}showError(e,t){return this.show(e,t,"error")}showSuccess(e,t){return this.show(e,t,"success")}createModalElement(e,t,s,r){const n=document.createElement("div");n.className="modal-backdrop",n.id=e;const o=document.createElement("style");o.textContent=this.getModalCSS(),n.appendChild(o),n.innerHTML+=`
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header ${r}">
                        <h3 class="modal-title">${t}</h3>
                        <button class="modal-close" onclick="document.getElementById('${e}').click()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="modal-icon ${r}">
                            ${this.getIconForType(r)}
                        </div>
                        <div class="modal-text">
                            ${s}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="modal-btn btn-${this.getButtonStyleForType(r)}" onclick="document.getElementById('${e}').click()">OK</button>
                    </div>
                </div>
            </div>
        `;const i=n.querySelector(".modal-dialog");return i&&i.addEventListener("click",c=>{c.stopPropagation()}),n}getIconForType(e){switch(e){case"info":return"ℹ";case"warning":return"⚠";case"error":return"✖";case"success":return"✓";default:return"ℹ"}}getButtonStyleForType(e){switch(e){case"error":return"danger";case"warning":return"warning";case"success":return"success";case"info":default:return"primary"}}getModalCSS(){return`
            .modal-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 1rem;
                opacity: 0;
                transition: var(--effect-transition);
                cursor: pointer;
            }

            .modal-backdrop.show {
                opacity: 1;
            }

            .modal-backdrop.hide {
                opacity: 0;
            }

            .modal-dialog {
                background: var(--color-surface);
                border-radius: var(--effect-border-radius-large);
                box-shadow: var(--effect-shadow-hover);
                max-width: 500px;
                width: 100%;
                max-height: 90vh;
                overflow: hidden;
                transform: scale(0.9);
                transition: var(--effect-transition);
                cursor: default;
            }

            .modal-backdrop.show .modal-dialog {
                transform: scale(1);
            }

            .modal-backdrop.hide .modal-dialog {
                transform: scale(0.9);
            }

            .modal-content {
                display: flex;
                flex-direction: column;
                max-height: 90vh;
            }

            .modal-header {
                padding: 1.5rem 1.5rem 1rem 1.5rem;
                display: flex;
                align-items: center;
                justify-content: space-between;
                border-bottom: 1px solid var(--color-border);
                color: var(--color-text-inverse);
            }

            .modal-header.info {
                background: linear-gradient(135deg, var(--color-info), var(--color-primary));
            }

            .modal-header.warning {
                background: linear-gradient(135deg, var(--color-warning), var(--color-warning));
            }

            .modal-header.error {
                background: linear-gradient(135deg, var(--color-error), var(--color-error));
            }

            .modal-header.success {
                background: linear-gradient(135deg, var(--color-success), var(--color-success));
            }

            .modal-title {
                margin: 0;
                font-size: 1.25rem;
                font-weight: 600;
                color: var(--color-text-inverse);
                font-family: var(--font-family);
            }

            .modal-close {
                background: none;
                border: none;
                font-size: 1.5rem;
                color: rgba(255, 255, 255, 0.8);
                cursor: pointer;
                padding: 0;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: var(--effect-border-radius);
                transition: var(--effect-transition);
            }

            .modal-close:hover {
                background: rgba(255, 255, 255, 0.1);
                color: var(--color-text-inverse);
            }

            .modal-body {
                padding: 1rem 1.5rem;
                flex: 1;
                overflow-y: auto;
                display: flex;
                align-items: flex-start;
                gap: 1rem;
                background: var(--color-surface);
            }

            .modal-icon {
                flex-shrink: 0;
                width: 48px;
                height: 48px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.5rem;
                font-weight: bold;
            }

            .modal-icon.info {
                background: rgba(0, 123, 255, 0.1);
                color: var(--color-info);
            }

            .modal-icon.warning {
                background: rgba(255, 193, 7, 0.1);
                color: var(--color-warning);
            }

            .modal-icon.error {
                background: rgba(220, 53, 69, 0.1);
                color: var(--color-error);
            }

            .modal-icon.success {
                background: rgba(40, 167, 69, 0.1);
                color: var(--color-success);
            }

            .modal-text {
                flex: 1;
                color: var(--color-text);
                line-height: 1.5;
                font-family: var(--font-family);
            }

            .modal-footer {
                padding: 1rem 1.5rem 1.5rem 1.5rem;
                display: flex;
                gap: 0.75rem;
                justify-content: flex-end;
                border-top: 1px solid var(--color-border);
                background: var(--color-background);
            }

            .modal-btn {
                padding: 0.5rem 1rem;
                border-radius: var(--effect-border-radius);
                font-weight: 500;
                font-size: 0.875rem;
                cursor: pointer;
                transition: var(--effect-transition);
                border: 1px solid;
                min-width: 80px;
                font-family: var(--font-family);
            }

            .btn-primary {
                background: var(--color-primary);
                color: var(--color-text-inverse);
                border-color: var(--color-primary);
            }

            .btn-primary:hover {
                background: var(--color-primary-hover);
                border-color: var(--color-primary-hover);
                transform: translateY(-1px);
            }

            .btn-warning {
                background: var(--color-warning);
                color: var(--color-text);
                border-color: var(--color-warning);
            }

            .btn-warning:hover {
                background: var(--color-warning);
                border-color: var(--color-warning);
                transform: translateY(-1px);
                opacity: 0.9;
            }

            .btn-danger {
                background: var(--color-error);
                color: var(--color-text-inverse);
                border-color: var(--color-error);
            }

            .btn-danger:hover {
                background: var(--color-error);
                border-color: var(--color-error);
                transform: translateY(-1px);
                opacity: 0.9;
            }

            .btn-success {
                background: var(--color-success);
                color: var(--color-text-inverse);
                border-color: var(--color-success);
            }

            .btn-success:hover {
                background: var(--color-success);
                border-color: var(--color-success);
                transform: translateY(-1px);
                opacity: 0.9;
            }

            @media (max-width: 768px) {
                .modal-backdrop {
                    padding: 0.5rem;
                }
                
                .modal-dialog {
                    max-width: 100%;
                    margin: 0;
                }
                
                .modal-header {
                    padding: 1rem 1rem 0.75rem 1rem;
                }
                
                .modal-body {
                    padding: 0.75rem 1rem;
                }
                
                .modal-footer {
                    padding: 0.75rem 1rem 1rem 1rem;
                }
                
                .modal-btn {
                    width: 100%;
                    margin: 0;
                }
                
                .modal-icon {
                    width: 40px;
                    height: 40px;
                    font-size: 1.25rem;
                }
            }
        `}}class Te{constructor(){this.currentView="list",this.currentPage="planner"}setView(e){this.currentView=e;const t=document.getElementById("view-list"),s=document.getElementById("view-grid");t&&s&&(e==="list"?(t.classList.add("btn-primary","active"),t.classList.remove("btn-secondary"),s.classList.add("btn-secondary"),s.classList.remove("btn-primary","active")):(s.classList.add("btn-primary","active"),s.classList.remove("btn-secondary"),t.classList.add("btn-secondary"),t.classList.remove("btn-primary","active")))}togglePage(){const e=this.currentPage==="planner"?"schedule":"planner";this.switchToPage(e)}switchToPage(e){if(e===this.currentPage)return;this.currentPage=e;const t=document.getElementById("schedule-btn");t&&(e==="schedule"?(t.textContent="Back to Classes",this.showSchedulePage()):(t.textContent="Schedule",this.showPlannerPage()))}showPlannerPage(){const e=document.getElementById("planner-page"),t=document.getElementById("schedule-page");e&&(e.style.display="grid"),t&&(t.style.display="none")}showSchedulePage(){const e=document.getElementById("planner-page"),t=document.getElementById("schedule-page");e&&(e.style.display="none"),t&&(t.style.display="flex")}showLoadingState(){const e=document.getElementById("department-list");e&&(e.innerHTML='<div class="loading-message">Loading departments...</div>')}showErrorMessage(e){const t=document.getElementById("department-list");t&&(t.innerHTML=`<div class="error-message">${e}</div>`);const s=document.getElementById("course-container");s&&(s.innerHTML=`<div class="error-message">${e}</div>`)}syncHeaderHeights(){const e=document.querySelector(".sidebar-header"),t=document.querySelector(".content-header"),s=document.querySelectorAll(".panel-header");!e||!t||!s.length||(document.documentElement.style.setProperty("--synced-header-height","auto"),requestAnimationFrame(()=>{const r=e.offsetHeight,n=t.offsetHeight,o=Array.from(s).map(c=>c.offsetHeight),i=Math.max(r,n,...o);document.documentElement.style.setProperty("--synced-header-height",`${i}px`)}))}setupHeaderResizeObserver(){if(!window.ResizeObserver)return;const e=[document.querySelector(".sidebar-header"),document.querySelector(".content-header"),...document.querySelectorAll(".panel-header")].filter(Boolean);if(!e.length)return;const t=new ResizeObserver(()=>{this.syncHeaderHeights()});e.forEach(s=>{t.observe(s)})}}class we{constructor(){}updateClientTimestamp(){const e=document.getElementById("client-timestamp");if(e){const t=new Date,s={month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",second:"2-digit",hour12:!0},r=t.toLocaleDateString("en-US",s).replace(","," at");e.textContent=`Client loaded: ${r}`}}async loadServerTimestamp(){const e=document.getElementById("server-timestamp");if(e)try{const t=await fetch("./last-updated.json",{cache:"no-cache"});if(t.ok){const s=await t.json(),r=new Date(s.timestamp),n={month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",second:"2-digit",hour12:!0},o=r.toLocaleDateString("en-US",n).replace(","," at");e.textContent=`Server updated: ${o}`}else throw new Error(`Failed to fetch server timestamp: ${t.status}`)}catch(t){console.warn("Failed to load server timestamp:",t),e.textContent="Server timestamp unavailable"}}}class $e{constructor(){this.allDepartments=[],this.previousSelectedCoursesCount=0,this.previousSelectedCoursesMap=new Map,this.courseDataService=new R,this.themeSelector=new he,this.courseSelectionService=new pe,this.conflictDetector=new ge,this.modalService=new Se,this.departmentController=new ve,this.courseController=new ye(this.courseSelectionService),this.scheduleController=new be(this.courseSelectionService),this.sectionInfoModalController=new Ce(this.modalService),this.infoModalController=new Ee(this.modalService),this.scheduleController.setSectionInfoModalController(this.sectionInfoModalController),this.uiStateManager=new Te,this.timestampManager=new we,this.scheduleController.setStatePreserver({preserve:()=>this.preserveDropdownStates(),restore:t=>this.restoreDropdownStates(t)});const e=this.courseSelectionService.getSelectedCourses();this.previousSelectedCoursesCount=e.length,this.previousSelectedCoursesMap=new Map,e.forEach(t=>{this.previousSelectedCoursesMap.set(t.course.id,t.selectedSectionNumber)}),this.init()}async init(){this.uiStateManager.showLoadingState(),await this.loadCourseData(),this.departmentController.displayDepartments(),this.setupEventListeners(),this.setupCourseSelectionListener(),this.courseController.displaySelectedCourses(),this.uiStateManager.syncHeaderHeights(),this.uiStateManager.setupHeaderResizeObserver()}async loadCourseData(){try{console.log("Loading course data...");const e=await this.courseDataService.loadCourseData();this.allDepartments=e.departments,this.departmentController.setAllDepartments(this.allDepartments),this.courseController.setAllDepartments(this.allDepartments),this.courseSelectionService.setAllDepartments(this.allDepartments),console.log(`Loaded ${this.allDepartments.length} departments`),console.log("Reconstructing section objects for persisted selections..."),this.courseSelectionService.reconstructSectionObjects(),this.timestampManager.updateClientTimestamp(),this.timestampManager.loadServerTimestamp()}catch(e){console.error("Failed to load course data:",e),this.uiStateManager.showErrorMessage("Failed to load course data. Please try refreshing the page.")}}setupEventListeners(){document.addEventListener("click",o=>{const i=o.target;if(i.classList.contains("department-item")){const c=i.dataset.deptId;if(c){const a=this.departmentController.handleDepartmentClick(c);a&&this.courseController.displayCourses(a.courses,this.uiStateManager.currentView)}}if(i.classList.contains("section-badge")&&i.classList.toggle("selected"),i.classList.contains("course-select-btn")){const c=i.closest(".course-item, .course-card");c&&this.courseController.toggleCourseSelection(c)}if(i.classList.contains("course-remove-btn")){const c=this.courseController.getCourseFromElement(i);c&&this.courseSelectionService.unselectCourse(c)}if(i.classList.contains("section-select-btn")){o.stopPropagation();const c=i.closest(".schedule-course-item"),a=i.dataset.section;if(c&&a){const h=this.scheduleController.getCourseFromElement(c);h&&this.scheduleController.handleSectionSelection(h,a)}return}if(i.classList.contains("section-option")||i.closest(".section-option")||i.classList.contains("section-info")||i.closest(".section-info")||i.classList.contains("section-number")||i.classList.contains("section-schedule")||i.classList.contains("section-professor")){o.stopPropagation(),o.preventDefault();return}if(i.classList.contains("dropdown-trigger")||i.closest(".dropdown-trigger")){const c=i.classList.contains("dropdown-trigger")?i:i.closest(".dropdown-trigger");c&&!i.classList.contains("course-remove-btn")&&!i.classList.contains("section-select-btn")&&!i.classList.contains("section-number")&&!i.classList.contains("section-schedule")&&!i.classList.contains("section-professor")&&!i.closest(".section-option")&&!i.closest(".section-info")&&!i.closest(".schedule-sections-container")&&this.toggleCourseDropdown(c)}if(i.closest(".course-item, .course-card")&&!i.classList.contains("course-select-btn")&&!i.classList.contains("section-badge")){const c=i.closest(".course-item, .course-card");c&&this.courseController.selectCourse(c)}});const e=document.getElementById("search-input");e&&e.addEventListener("input",()=>{const o=this.courseController.handleSearch(e.value,this.departmentController.getSelectedDepartment());this.courseController.displayCourses(o,this.uiStateManager.currentView)});const t=document.getElementById("clear-selection");t&&t.addEventListener("click",()=>{this.clearSelection()});const s=document.getElementById("schedule-btn");s&&s.addEventListener("click",()=>{if(this.uiStateManager.togglePage(),this.uiStateManager.currentPage==="schedule"){const o=this.courseSelectionService.getSelectedCourses();console.log("=== SCHEDULE PAGE LOADED ==="),console.log(`Found ${o.length} selected courses with sections:`),o.forEach(i=>{const c=i.selectedSection!==null;console.log(`${i.course.department.abbreviation}${i.course.number}: section ${i.selectedSectionNumber} ${c?"✓":"✗"}`),c&&i.selectedSection&&(console.log(`  Term: ${i.selectedSection.term}, Periods: ${i.selectedSection.periods.length}`),console.log("  Full section object:",i.selectedSection),i.selectedSection.periods.forEach((a,h)=>{console.log(`    Period ${h+1}:`,{type:a.type,professor:a.professor,startTime:a.startTime,endTime:a.endTime,days:Array.from(a.days),location:a.location,building:a.building,room:a.room});const d=Math.floor((a.startTime.hours*60+a.startTime.minutes-7*60)/10),f=Math.floor((a.endTime.hours*60+a.endTime.minutes-7*60)/10),p=f-d;console.log(`      Time slots: ${d} to ${f} (span ${p} rows)`)}))}),console.log(`=== END SCHEDULE SECTION DATA ===
`),this.scheduleController.displayScheduleSelectedCourses(),this.scheduleController.renderScheduleGrids()}});const r=document.getElementById("view-list"),n=document.getElementById("view-grid");r&&r.addEventListener("click",()=>{this.uiStateManager.setView("list"),this.refreshCurrentView()}),n&&n.addEventListener("click",()=>{this.uiStateManager.setView("grid"),this.refreshCurrentView()})}refreshCurrentView(){const e=this.departmentController.getSelectedDepartment();if(e)this.courseController.displayCourses(e.courses,this.uiStateManager.currentView);else{const t=document.getElementById("search-input");if(t?.value.trim()){const s=this.courseController.handleSearch(t.value,null);this.courseController.displayCourses(s,this.uiStateManager.currentView)}}}clearSelection(){document.querySelectorAll(".section-badge.selected").forEach(r=>{r.classList.remove("selected")});const e=document.getElementById("search-input");e&&(e.value="");const t=document.getElementById("course-container");t&&(t.innerHTML='<div class="loading-message">Select a department to view courses...</div>');const s=document.querySelector(".content-header h2");s&&(s.textContent="Course Listings"),this.departmentController.clearDepartmentSelection(),this.courseController.clearCourseSelection(),this.courseController.displaySelectedCourses()}setupCourseSelectionListener(){this.courseSelectionService.onSelectionChange(e=>{const t=e.length,s=t!==this.previousSelectedCoursesCount,r=new Map;if(e.forEach(n=>{r.set(n.course.id,n.selectedSectionNumber)}),this.courseController.refreshCourseSelectionUI(),this.courseController.displaySelectedCourses(),s)this.scheduleController.displayScheduleSelectedCourses();else{let n=!1;for(const[o,i]of r)if(this.previousSelectedCoursesMap.get(o)!==i){n=!0;const a=e.find(h=>h.course.id===o);a&&this.scheduleController.updateSectionButtonStates(a.course,i)}n&&this.uiStateManager.currentPage==="schedule"&&this.scheduleController.renderScheduleGrids()}this.previousSelectedCoursesCount=t,this.previousSelectedCoursesMap=new Map(r)})}getSelectedCourses(){return this.courseSelectionService.getSelectedCourses()}getSelectedCoursesCount(){return this.courseSelectionService.getSelectedCoursesCount()}getCourseSelectionService(){return this.courseSelectionService}getModalService(){return this.modalService}getSectionInfoModalController(){return this.sectionInfoModalController}getInfoModalController(){return this.infoModalController}toggleCourseDropdown(e){const t=e.closest(".schedule-course-item");if(!t)return;t.classList.contains("collapsed")?(t.classList.remove("collapsed"),t.classList.add("expanded")):(t.classList.remove("expanded"),t.classList.add("collapsed"))}preserveDropdownStates(){const e=new Map;return document.querySelectorAll(".schedule-course-item").forEach(t=>{const s=this.scheduleController.getCourseFromElement(t);if(s){const r=t.classList.contains("expanded");e.set(s.id,r)}}),e}restoreDropdownStates(e){document.querySelectorAll(".schedule-course-item").forEach(t=>{const s=this.scheduleController.getCourseFromElement(t);s&&e.has(s.id)&&(e.get(s.id)?(t.classList.remove("collapsed"),t.classList.add("expanded")):(t.classList.remove("expanded"),t.classList.add("collapsed")))})}}new $e;
//# sourceMappingURL=index-jR0Md2eA.js.map
