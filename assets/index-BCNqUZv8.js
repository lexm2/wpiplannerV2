(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))r(s);new MutationObserver(s=>{for(const i of s)if(i.type==="childList")for(const o of i.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&r(o)}).observe(document,{childList:!0,subtree:!0});function t(s){const i={};return s.integrity&&(i.integrity=s.integrity),s.referrerPolicy&&(i.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?i.credentials="include":s.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function r(s){if(s.ep)return;s.ep=!0;const i=t(s);fetch(s.href,i)}})();var u=(d=>(d.MONDAY="mon",d.TUESDAY="tue",d.WEDNESDAY="wed",d.THURSDAY="thu",d.FRIDAY="fri",d.SATURDAY="sat",d.SUNDAY="sun",d))(u||{});const T=class T{constructor(){this.scheduleDB=null}async loadCourseData(){try{console.log("Loading course data...");const e=await this.fetchFreshData();return this.scheduleDB=e,e}catch(e){throw console.error("Failed to load course data:",e),new Error("No course data available")}}async fetchFreshData(){console.log("Fetching course data from local static file...");const e=await fetch(T.WPI_COURSE_DATA_URL,{method:"GET",headers:{Accept:"application/json"},cache:"no-cache"});if(!e.ok)throw new Error(`Failed to fetch course data: ${e.status} ${e.statusText}`);const t=await e.json();return this.parseJSONData(t)}parseJSONData(e){if(console.log("Parsing constructed JSON data..."),!e.departments||!Array.isArray(e.departments))throw console.error("Invalid JSON data structure:",e),new Error("Invalid JSON data structure - missing departments array");console.log(`Processing ${e.departments.length} departments...`);const t={departments:this.parseConstructedDepartments(e.departments),generated:e.generated||new Date().toISOString()};return console.log(`Loaded ${t.departments.length} departments with course data`),this.logMA1024Sections(t),t}parseConstructedDepartments(e){return e.map(t=>{const r={abbreviation:t.abbreviation,name:t.name,courses:[]};return r.courses=t.courses.map(s=>({id:s.id,number:s.number,name:s.name,description:this.stripHtml(s.description||""),department:r,sections:this.parseConstructedSections(s.sections||[]),minCredits:s.min_credits||0,maxCredits:s.max_credits||0})),r})}parseConstructedSections(e){return e.map(t=>({crn:t.crn||0,number:t.number||"",seats:t.seats||0,seatsAvailable:t.seats_available||0,actualWaitlist:t.actual_waitlist||0,maxWaitlist:t.max_waitlist||0,note:t.note,description:this.stripHtml(t.description||""),term:t.term||"",periods:this.parseConstructedPeriods(t.periods||[])}))}parseConstructedPeriods(e){return e.map(t=>({type:t.type||"Lecture",professor:t.professor||"",professorEmail:void 0,startTime:this.parseConstructedTime(t.start_time),endTime:this.parseConstructedTime(t.end_time),location:t.location||"",building:t.building||"",room:t.room||"",seats:t.seats||0,seatsAvailable:t.seats_available||0,actualWaitlist:t.actual_waitlist||0,maxWaitlist:t.max_waitlist||0,days:this.parseConstructedDays(t.days||[]),specificSection:t.specific_section}))}parseConstructedTime(e){if(!e||e==="TBA")return{hours:0,minutes:0,displayTime:"TBD"};const t=e.match(/(\d{1,2}):(\d{2})/);if(!t)return{hours:0,minutes:0,displayTime:e};const r=parseInt(t[1]),s=parseInt(t[2]),i=r===0?12:r>12?r-12:r,o=r>=12?"PM":"AM",n=`${i}:${s.toString().padStart(2,"0")} ${o}`;return{hours:r,minutes:s,displayTime:n}}parseConstructedDays(e){const t=new Set;for(const r of e)switch(r.toLowerCase()){case"mon":t.add(u.MONDAY);break;case"tue":t.add(u.TUESDAY);break;case"wed":t.add(u.WEDNESDAY);break;case"thu":t.add(u.THURSDAY);break;case"fri":t.add(u.FRIDAY);break;case"sat":t.add(u.SATURDAY);break;case"sun":t.add(u.SUNDAY);break}return t}logMA1024Sections(e){const t=e.departments.find(s=>s.abbreviation==="MA");if(!t){console.log("MA department not found");return}const r=t.courses.find(s=>s.number==="1024");if(!r){console.log("MA1024 course not found");return}console.log(`
=== MA1024 SECTIONS (${r.sections.length} total) ===`),r.sections.forEach(s=>{console.log(`Section ${s.number}:`),console.log(`  Term: ${s.term}`),console.log(`  Enrollment: ${s.seatsAvailable}/${s.seats} available`),console.log(`  Periods (${s.periods.length}):`),s.periods.forEach((i,o)=>{const n=Array.from(i.days).join(", ");console.log(`    ${o+1}. ${i.type} - ${n} ${i.startTime.displayTime}-${i.endTime.displayTime} (${i.professor})`)}),console.log("")})}stripHtml(e){return e.replace(/<[^>]*>/g,"").replace(/&[^;]+;/g," ").trim()}getCachedData(){try{const e=localStorage.getItem(T.LOCAL_STORAGE_KEY);return e?JSON.parse(e).scheduleDB:null}catch(e){return console.warn("Failed to parse cached course data:",e),null}}cacheData(e){try{const t={scheduleDB:e,timestamp:Date.now()};localStorage.setItem(T.LOCAL_STORAGE_KEY,JSON.stringify(t)),console.log("Course data cached successfully")}catch(t){console.warn("Failed to cache course data:",t)}}isCacheExpired(){try{const e=localStorage.getItem(T.LOCAL_STORAGE_KEY);if(!e)return!0;const t=JSON.parse(e),r=Date.now()-t.timestamp,s=T.CACHE_EXPIRY_HOURS*60*60*1e3;return r>s}catch{return!0}}getScheduleDB(){return this.scheduleDB}searchCourses(e,t){if(!this.scheduleDB)return[];const r=[];for(const i of this.scheduleDB.departments)t&&t.length>0&&!t.includes(i.abbreviation.toLowerCase())||r.push(...i.courses);if(!e.trim())return r;const s=e.toLowerCase();return r.filter(i=>i.name.toLowerCase().includes(s)||i.number.toLowerCase().includes(s)||i.id.toLowerCase().includes(s)||i.department.abbreviation.toLowerCase().includes(s))}getAllDepartments(){return this.scheduleDB?.departments||[]}};T.WPI_COURSE_DATA_URL="./course-data-constructed.json",T.LOCAL_STORAGE_KEY="wpi-course-data",T.CACHE_EXPIRY_HOURS=1;let k=T;const B="WPI Classic",P="wpi-classic",H="Traditional WPI colors and styling",N={primary:"#ac2b37",primaryHover:"#8e2329",primaryLight:"#d4424f",secondary:"#f5f5f7",secondaryHover:"#e5e5e7",background:"#f5f5f7",backgroundAlt:"#ffffff",surface:"#ffffff",surfaceHover:"#fbfbfd",text:"#1d1d1f",textSecondary:"#86868b",textInverse:"#ffffff",border:"#e5e5e7",borderHover:"#d2d2d7",success:"#30d158",warning:"#ff9500",error:"#d32f2f",info:"#007aff"},U={fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",fontFamilyMono:"'SF Mono', Monaco, 'Cascadia Code', monospace"},z={baseUnit:"1rem",headerHeight:"64px",sidebarWidth:"280px",rightPanelWidth:"320px"},q={borderRadius:"6px",borderRadiusLarge:"8px",shadow:"0 1px 3px rgba(0,0,0,0.1)",shadowHover:"0 2px 8px rgba(172, 43, 55, 0.1)",transition:"all 0.2s ease"},V={name:B,id:P,description:H,colors:N,typography:U,spacing:z,effects:q},Y="WPI Dark",j="wpi-dark",_="Dark mode theme with WPI accent colors",W={primary:"#d4424f",primaryHover:"#ac2b37",primaryLight:"#e85a66",secondary:"#2c2c2e",secondaryHover:"#3a3a3c",background:"#1c1c1e",backgroundAlt:"#2c2c2e",surface:"#2c2c2e",surfaceHover:"#3a3a3c",text:"#ffffff",textSecondary:"#98989d",textInverse:"#1d1d1f",border:"#3a3a3c",borderHover:"#48484a",success:"#30d158",warning:"#ff9f0a",error:"#ff453a",info:"#64d2ff"},G={fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",fontFamilyMono:"'SF Mono', Monaco, 'Cascadia Code', monospace"},K={baseUnit:"1rem",headerHeight:"64px",sidebarWidth:"280px",rightPanelWidth:"320px"},J={borderRadius:"6px",borderRadiusLarge:"8px",shadow:"0 2px 8px rgba(0,0,0,0.3)",shadowHover:"0 4px 16px rgba(212, 66, 79, 0.2)",transition:"all 0.2s ease"},Z={name:Y,id:j,description:_,colors:W,typography:G,spacing:K,effects:J},Q="WPI Light",X="wpi-light",ee="Clean light theme with softer WPI colors",te={primary:"#b8394a",primaryHover:"#9c2f3d",primaryLight:"#d4556b",secondary:"#f8f8fa",secondaryHover:"#ededef",background:"#ffffff",backgroundAlt:"#f8f8fa",surface:"#ffffff",surfaceHover:"#f8f8fa",text:"#2c2c2e",textSecondary:"#6d6d70",textInverse:"#ffffff",border:"#d1d1d6",borderHover:"#c7c7cc",success:"#28a745",warning:"#fd7e14",error:"#dc3545",info:"#17a2b8"},re={fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",fontFamilyMono:"'SF Mono', Monaco, 'Cascadia Code', monospace"},se={baseUnit:"1rem",headerHeight:"64px",sidebarWidth:"280px",rightPanelWidth:"320px"},ie={borderRadius:"8px",borderRadiusLarge:"12px",shadow:"0 1px 4px rgba(0,0,0,0.08)",shadowHover:"0 3px 12px rgba(184, 57, 74, 0.15)",transition:"all 0.2s ease"},oe={name:Q,id:X,description:ee,colors:te,typography:re,spacing:se,effects:ie},ne="High Contrast",ae="high-contrast",ce="Accessibility-focused high contrast theme",le={primary:"#000000",primaryHover:"#333333",primaryLight:"#666666",secondary:"#ffffff",secondaryHover:"#f0f0f0",background:"#ffffff",backgroundAlt:"#f8f8f8",surface:"#ffffff",surfaceHover:"#f0f0f0",text:"#000000",textSecondary:"#444444",textInverse:"#ffffff",border:"#000000",borderHover:"#333333",success:"#006600",warning:"#cc6600",error:"#cc0000",info:"#0066cc"},de={fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",fontFamilyMono:"'SF Mono', Monaco, 'Cascadia Code', monospace"},ue={baseUnit:"1rem",headerHeight:"64px",sidebarWidth:"280px",rightPanelWidth:"320px"},he={borderRadius:"2px",borderRadiusLarge:"4px",shadow:"0 0 0 2px #000000",shadowHover:"0 0 0 3px #000000",transition:"all 0.1s ease"},me={name:ne,id:ae,description:ce,colors:le,typography:de,spacing:ue,effects:he};class M{constructor(){this.currentTheme="wpi-classic",this.themes=new Map,this.listeners=new Set,this.storageKey="wpi-planner-theme",this.initializeThemes(),this.loadSavedTheme()}static getInstance(){return M.instance||(M.instance=new M),M.instance}initializeThemes(){this.registerTheme(V),this.registerTheme(Z),this.registerTheme(oe),this.registerTheme(me)}loadSavedTheme(){try{const e=localStorage.getItem(this.storageKey);e&&this.themes.has(e)&&(this.currentTheme=e)}catch(e){console.warn("Failed to load saved theme preference:",e)}this.applyTheme(this.currentTheme)}registerTheme(e){if(!this.isValidTheme(e)){console.error("Invalid theme definition:",e);return}this.themes.set(e.id,e)}isValidTheme(e){return e&&typeof e.name=="string"&&typeof e.id=="string"&&typeof e.description=="string"&&e.colors&&e.typography&&e.spacing&&e.effects}getAvailableThemes(){return Array.from(this.themes.values())}getCurrentTheme(){return this.themes.get(this.currentTheme)||null}getCurrentThemeId(){return this.currentTheme}setTheme(e){if(!this.themes.has(e))return console.error(`Theme '${e}' not found`),!1;const t=this.currentTheme,r=e,s=this.themes.get(e);this.currentTheme=e,this.applyTheme(e),this.saveThemePreference(e);const i={oldTheme:t,newTheme:r,themeDefinition:s};return this.notifyListeners(i),!0}applyTheme(e){const t=this.themes.get(e);if(!t)return;const r=document.documentElement;Object.entries(t.colors).forEach(([s,i])=>{r.style.setProperty(`--color-${this.kebabCase(s)}`,i)}),Object.entries(t.typography).forEach(([s,i])=>{r.style.setProperty(`--font-${this.kebabCase(s)}`,i)}),Object.entries(t.spacing).forEach(([s,i])=>{r.style.setProperty(`--spacing-${this.kebabCase(s)}`,i)}),Object.entries(t.effects).forEach(([s,i])=>{r.style.setProperty(`--effect-${this.kebabCase(s)}`,i)}),document.body.className=document.body.className.replace(/theme-[\w-]+/g,"").trim(),document.body.classList.add(`theme-${e}`)}kebabCase(e){return e.replace(/([a-z])([A-Z])/g,"$1-$2").toLowerCase()}saveThemePreference(e){try{localStorage.setItem(this.storageKey,e)}catch(t){console.warn("Failed to save theme preference:",t)}}detectSystemPreference(){if(typeof window<"u"&&window.matchMedia){if(window.matchMedia("(prefers-color-scheme: dark)").matches)return"wpi-dark";if(window.matchMedia("(prefers-contrast: high)").matches)return"high-contrast"}return"wpi-classic"}useSystemPreference(){const e=this.detectSystemPreference();return this.setTheme(e)}onThemeChange(e){this.listeners.add(e)}offThemeChange(e){this.listeners.delete(e)}notifyListeners(e){this.listeners.forEach(t=>{try{t(e)}catch(r){console.error("Error in theme change listener:",r)}})}previewTheme(e){return this.themes.has(e)?(this.applyTheme(e),!0):!1}resetToCurrentTheme(){this.applyTheme(this.currentTheme)}exportCurrentTheme(){const e=this.getCurrentTheme();if(!e)throw new Error("No current theme to export");return JSON.stringify(e,null,2)}importTheme(e){try{const t=JSON.parse(e);return this.isValidTheme(t)?(this.registerTheme(t),!0):!1}catch(t){return console.error("Failed to import theme:",t),!1}}getThemeById(e){return this.themes.get(e)||null}hasTheme(e){return this.themes.has(e)}removeTheme(e){return["wpi-classic","wpi-dark","wpi-light","high-contrast"].includes(e)?(console.warn(`Cannot remove built-in theme: ${e}`),!1):(this.currentTheme===e&&this.setTheme("wpi-classic"),this.themes.delete(e))}}const b=class b{constructor(){this.replacer=(e,t)=>{if(t instanceof Set)return{__type:"Set",value:[...t]};if(e==="department"&&t&&t.courses)return{abbreviation:t.abbreviation,name:t.name};if(!(e==="selectedSection"&&t&&typeof t=="object"&&t.number))return t},this.reviver=(e,t)=>typeof t=="object"&&t!==null&&t.__type==="Set"?new Set(t.value):t}saveUserState(e){this.handleStorageOperation(()=>{const t=JSON.stringify(e,this.replacer);localStorage.setItem(b.STORAGE_KEYS.USER_STATE,t)},"Failed to save user state")}loadUserState(){return this.handleStorageOperation(()=>{const e=localStorage.getItem(b.STORAGE_KEYS.USER_STATE);return e?JSON.parse(e,this.reviver):null},"Failed to load user state",null)}saveSchedule(e){this.handleStorageOperation(()=>{const t=this.loadAllSchedules(),r=t.findIndex(i=>i.id===e.id);r>=0?t[r]=e:t.push(e);const s=JSON.stringify(t,this.replacer);localStorage.setItem(b.STORAGE_KEYS.SCHEDULES,s)},"Failed to save schedule")}loadSchedule(e){try{return this.loadAllSchedules().find(r=>r.id===e)||null}catch(t){return console.warn("Failed to load schedule:",t),null}}loadAllSchedules(){return this.handleStorageOperation(()=>{const e=localStorage.getItem(b.STORAGE_KEYS.SCHEDULES);return e?JSON.parse(e,this.reviver):[]},"Failed to load schedules",[])}deleteSchedule(e){try{const r=this.loadAllSchedules().filter(s=>s.id!==e);localStorage.setItem(b.STORAGE_KEYS.SCHEDULES,JSON.stringify(r))}catch(t){console.warn("Failed to delete schedule:",t)}}savePreferences(e){this.handleStorageOperation(()=>{const t=JSON.stringify(e,this.replacer);localStorage.setItem(b.STORAGE_KEYS.PREFERENCES,t)},"Failed to save preferences")}loadPreferences(){return this.handleStorageOperation(()=>{const e=localStorage.getItem(b.STORAGE_KEYS.PREFERENCES);return e?JSON.parse(e,this.reviver):this.getDefaultPreferences()},"Failed to load preferences",this.getDefaultPreferences())}getDefaultPreferences(){return{preferredTimeRange:{startTime:{hours:8,minutes:0},endTime:{hours:18,minutes:0}},preferredDays:new Set(["mon","tue","wed","thu","fri"]),avoidBackToBackClasses:!1,theme:"wpi-classic"}}clearAllData(){try{Object.values(b.STORAGE_KEYS).forEach(e=>{localStorage.removeItem(e)})}catch(e){console.warn("Failed to clear storage:",e)}}exportData(){const e=this.loadUserState(),t=this.loadAllSchedules(),r=this.loadPreferences(),s={version:"1.0",timestamp:new Date().toISOString(),state:e,schedules:t,preferences:r};return JSON.stringify(s,null,2)}importData(e){try{const t=JSON.parse(e);return t.state&&this.saveUserState(t.state),t.preferences&&this.savePreferences(t.preferences),t.schedules&&t.schedules.forEach(r=>{this.saveSchedule(r)}),!0}catch(t){return console.error("Failed to import data:",t),!1}}handleStorageOperation(e,t,r){try{return e()}catch(s){return console.warn(`${t}:`,s),r}}saveThemePreference(e){try{localStorage.setItem(b.STORAGE_KEYS.THEME,e)}catch(t){console.warn("Failed to save theme preference:",t)}}loadThemePreference(){try{return localStorage.getItem(b.STORAGE_KEYS.THEME)||"wpi-classic"}catch(e){return console.warn("Failed to load theme preference:",e),"wpi-classic"}}saveSelectedCourses(e){this.handleStorageOperation(()=>{const t=JSON.stringify(e,this.replacer);localStorage.setItem(b.STORAGE_KEYS.SELECTED_COURSES,t)},"Failed to save selected courses")}loadSelectedCourses(){return this.handleStorageOperation(()=>{const e=localStorage.getItem(b.STORAGE_KEYS.SELECTED_COURSES);return e?JSON.parse(e,this.reviver):[]},"Failed to load selected courses",[])}clearSelectedCourses(){try{localStorage.removeItem(b.STORAGE_KEYS.SELECTED_COURSES)}catch(e){console.warn("Failed to clear selected courses:",e)}}};b.STORAGE_KEYS={USER_STATE:"wpi-planner-user-state",PREFERENCES:"wpi-planner-preferences",SCHEDULES:"wpi-planner-schedules",SELECTED_COURSES:"wpi-planner-selected-courses",THEME:"wpi-planner-theme"};let O=b;class fe{constructor(){this.dropdownElement=null,this.optionsElement=null,this.currentThemeNameElement=null,this.isOpen=!1,this.themeManager=M.getInstance(),this.storageManager=new O,this.init()}init(){this.setupElements(),this.loadSavedTheme(),this.setupEventListeners(),this.renderThemeOptions()}setupElements(){this.dropdownElement=document.getElementById("theme-dropdown"),this.optionsElement=document.getElementById("theme-options"),this.currentThemeNameElement=document.getElementById("current-theme-name")}loadSavedTheme(){const e=this.storageManager.loadThemePreference();this.themeManager.setTheme(e),this.updateCurrentThemeDisplay()}setupEventListeners(){!this.dropdownElement||!this.optionsElement||(this.dropdownElement.addEventListener("click",e=>{e.stopPropagation(),this.toggleDropdown()}),document.addEventListener("click",()=>{this.closeDropdown()}),this.optionsElement.addEventListener("click",e=>{e.stopPropagation()}))}toggleDropdown(){this.isOpen?this.closeDropdown():this.openDropdown()}openDropdown(){!this.dropdownElement||!this.optionsElement||(this.isOpen=!0,this.dropdownElement.classList.add("open"),this.optionsElement.classList.add("show"))}closeDropdown(){!this.dropdownElement||!this.optionsElement||(this.isOpen=!1,this.dropdownElement.classList.remove("open"),this.optionsElement.classList.remove("show"))}renderThemeOptions(){if(!this.optionsElement)return;const e=this.themeManager.getAvailableThemes(),t=this.themeManager.getCurrentThemeId();let r="";e.forEach(s=>{const i=s.id===t;r+=`
                <div class="theme-option ${i?"active":""}" data-theme-id="${s.id}">
                    <div class="theme-option-name">${s.name}</div>
                    <div class="theme-option-description">${s.description}</div>
                </div>
            `}),this.optionsElement.innerHTML=r,this.optionsElement.querySelectorAll(".theme-option").forEach(s=>{s.addEventListener("click",()=>{const i=s.dataset.themeId;i&&this.selectTheme(i)})})}selectTheme(e){this.themeManager.setTheme(e)&&(this.storageManager.saveThemePreference(e),this.updateCurrentThemeDisplay(),this.updateActiveOption(e),this.closeDropdown())}updateCurrentThemeDisplay(){if(!this.currentThemeNameElement)return;const e=this.themeManager.getCurrentTheme();e&&(this.currentThemeNameElement.textContent=e.name)}updateActiveOption(e){if(!this.optionsElement)return;this.optionsElement.querySelectorAll(".theme-option").forEach(r=>{r.classList.remove("active")});const t=this.optionsElement.querySelector(`[data-theme-id="${e}"]`);t&&t.classList.add("active")}refresh(){this.renderThemeOptions(),this.updateCurrentThemeDisplay()}setTheme(e){this.selectTheme(e)}}class pe{constructor(){this.selectedCourses=new Map,this.listeners=new Set,this.allSections=new Set,this.allDepartments=[]}addCourse(e,t=!1){const r={course:e,selectedSection:null,selectedSectionNumber:null,isRequired:t};this.selectedCourses.set(e,r),this.notifyListeners()}removeCourse(e){this.selectedCourses.delete(e),this.notifyListeners()}getSelectedCourses(){return Array.from(this.selectedCourses.values())}getSelectedCourse(e){return this.selectedCourses.get(e)}isSelected(e){return this.selectedCourses.has(e)}getAvailableSections(e){const t=this.selectedCourses.get(e);return this.validateCourseExists(e,t)?t.course.sections:[]}clearAll(){this.selectedCourses.clear(),this.notifyListeners()}onSelectionChange(e){this.listeners.add(e)}offSelectionChange(e){this.listeners.delete(e)}setSelectedSection(e,t){const r=this.selectedCourses.get(e);if(!this.validateCourseExists(e,r))return;const s=t&&e.sections.find(i=>i.number===t)||null;r.selectedSection=s,r.selectedSectionNumber=t,this.notifyListeners()}getSelectedSection(e){return this.selectedCourses.get(e)?.selectedSectionNumber||null}getSelectedSectionObject(e){return this.selectedCourses.get(e)?.selectedSection||null}loadSelectedCourses(e){this.selectedCourses.clear(),e.forEach(t=>{if(t.selectedSection&&typeof t.selectedSection=="string"){const r=t.selectedSection,s=t.course.sections.find(i=>i.number===r)||null;t.selectedSection=s,t.selectedSectionNumber=r}else t.selectedSection&&!t.selectedSectionNumber&&(t.selectedSectionNumber=t.selectedSection.number);this.selectedCourses.set(t.course,t)}),this.notifyListeners()}validateCourseExists(e,t){return t?!0:(console.warn(`Course ${e.id} not found in selected courses`),!1)}notifyListeners(){const e=this.getSelectedCourses();this.listeners.forEach(t=>t(e))}setAllDepartments(e){this.allDepartments=e,this.populateAllSections()}populateAllSections(){this.allSections.clear();for(const e of this.allDepartments)for(const t of e.courses)for(const r of t.sections)this.allSections.add(r);console.log(`CourseManager: Populated ${this.allSections.size} sections from ${this.allDepartments.length} departments`)}getAllSections(){return Array.from(this.allSections)}getAllSectionsForCourse(e){return e.sections}getAllSectionsForDepartment(e){const t=this.allDepartments.find(s=>s.abbreviation===e);if(!t)return[];const r=[];for(const s of t.courses)r.push(...s.sections);return r}getAllDepartments(){return this.allDepartments}reconstructSectionObjects(){console.log("=== RECONSTRUCTING SECTION OBJECTS ===");let e=0,t=0;this.selectedCourses.forEach((r,s)=>{if(r.selectedSectionNumber&&!r.selectedSection){console.log(`Reconstructing section for ${s.department.abbreviation}${s.number}:`),console.log(`  Looking for section: ${r.selectedSectionNumber}`),console.log(`  Course has ${s.sections.length} sections:`,s.sections.map(o=>o.number));const i=s.sections.find(o=>o.number===r.selectedSectionNumber)||null;i?(r.selectedSection=i,e++,console.log(`  ✓ Successfully reconstructed section ${i.number}`)):(t++,console.log(`  ✗ Failed to find section ${r.selectedSectionNumber}`))}else r.selectedSection&&console.log(`Section already exists for ${s.department.abbreviation}${s.number}: ${r.selectedSection.number}`)}),console.log(`Reconstruction complete: ${e} succeeded, ${t} failed`),console.log(`=== END SECTION RECONSTRUCTION ===
`),e>0&&this.notifyListeners()}findCourseContainingSection(e){for(const t of this.allDepartments)for(const r of t.courses)if(r.sections.includes(e))return r}}class ${static isValidCourse(e){return e&&typeof e.id=="string"&&typeof e.number=="string"&&typeof e.name=="string"&&typeof e.description=="string"&&this.isValidDepartment(e.department)&&Array.isArray(e.sections)&&e.sections.every(t=>this.isValidSection(t))&&typeof e.minCredits=="number"&&typeof e.maxCredits=="number"}static isValidDepartment(e){return e&&typeof e.abbreviation=="string"&&typeof e.name=="string"&&(e.courses===void 0||Array.isArray(e.courses))}static isValidSection(e){return e&&typeof e.crn=="number"&&typeof e.number=="string"&&typeof e.seats=="number"&&typeof e.seatsAvailable=="number"&&typeof e.actualWaitlist=="number"&&typeof e.maxWaitlist=="number"&&typeof e.description=="string"&&typeof e.term=="string"&&Array.isArray(e.periods)&&e.periods.every(t=>this.isValidPeriod(t))}static isValidPeriod(e){return e&&typeof e.type=="string"&&typeof e.professor=="string"&&this.isValidTime(e.startTime)&&this.isValidTime(e.endTime)&&typeof e.location=="string"&&typeof e.building=="string"&&typeof e.room=="string"&&typeof e.seats=="number"&&typeof e.seatsAvailable=="number"&&typeof e.actualWaitlist=="number"&&typeof e.maxWaitlist=="number"&&e.days instanceof Set}static isValidTime(e){return e&&typeof e.hours=="number"&&typeof e.minutes=="number"&&typeof e.displayTime=="string"&&e.hours>=0&&e.hours<=23&&e.minutes>=0&&e.minutes<=59}static isValidSchedulePreferences(e){return e&&this.isValidTimeRange(e.preferredTimeRange)&&e.preferredDays instanceof Set&&typeof e.avoidBackToBackClasses=="boolean"}static isValidTimeRange(e){return e&&this.isValidTime(e.startTime)&&this.isValidTime(e.endTime)}static isValidSelectedCourse(e){return e&&this.isValidCourse(e.course)&&typeof e.isRequired=="boolean"}static isValidSchedule(e){return e&&typeof e.id=="string"&&typeof e.name=="string"&&Array.isArray(e.selectedCourses)&&e.selectedCourses.every(t=>this.isValidSelectedCourse(t))&&Array.isArray(e.generatedSchedules)&&this.isValidSchedulePreferences(e.preferences)}static sanitizeString(e){return e.replace(/<[^>]*>/g,"").trim()}static sanitizeCourseData(e){try{return this.isValidCourse(e)?{...e,name:this.sanitizeString(e.name),description:this.sanitizeString(e.description),sections:e.sections.map(t=>({...t,description:this.sanitizeString(t.description),periods:t.periods.map(r=>({...r,professor:this.sanitizeString(r.professor),location:this.sanitizeString(r.location),building:this.sanitizeString(r.building),room:this.sanitizeString(r.room)}))}))}:null}catch(t){return console.warn("Error sanitizing course data:",t),null}}static validateCourseId(e){return/^[A-Z]{2,4}-\d{3,4}$/.test(e)}static validateSectionNumber(e){return typeof e=="string"&&e.trim().length>0&&/^[\w\s\-/]+$/.test(e)}static validateEmail(e){return/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)}}class ge{constructor(e,t){this.courseManager=e||new pe,this.storageManager=t||new O,this.loadPersistedSelections(),this.setupPersistenceListener()}selectCourse(e,t=!1){if(!$.isValidCourse(e))throw new Error("Invalid course object provided");this.courseManager.addCourse(e,t)}unselectCourse(e){if(!$.isValidCourse(e))throw new Error("Invalid course object provided");this.courseManager.removeCourse(e)}toggleCourseSelection(e,t=!1){return this.isCourseSelected(e)?(this.unselectCourse(e),!1):(this.selectCourse(e,t),!0)}setSelectedSection(e,t){if(!$.isValidCourse(e))throw new Error("Invalid course object provided");if(t!==null&&!$.validateSectionNumber(t))throw new Error("Invalid sectionNumber provided");this.courseManager.setSelectedSection(e,t)}getSelectedSection(e){if(!$.isValidCourse(e))throw new Error("Invalid course object provided");return this.courseManager.getSelectedSection(e)}getSelectedSectionObject(e){if(!$.isValidCourse(e))throw new Error("Invalid course object provided");return this.courseManager.getSelectedSectionObject(e)}isCourseSelected(e){return $.isValidCourse(e)?this.courseManager.isSelected(e):!1}getSelectedCourses(){return this.courseManager.getSelectedCourses()}getSelectedCourse(e){if($.isValidCourse(e))return this.courseManager.getSelectedCourse(e)}clearAllSelections(){this.courseManager.clearAll(),this.storageManager.clearSelectedCourses()}getSelectedCoursesCount(){return this.getSelectedCourses().length}getSelectedCourseIds(){return this.getSelectedCourses().map(e=>e.course.id)}onSelectionChange(e){this.courseManager.onSelectionChange(e)}offSelectionChange(e){this.courseManager.offSelectionChange(e)}loadPersistedSelections(){const e=this.storageManager.loadSelectedCourses();e.length>0&&this.courseManager.loadSelectedCourses(e)}setupPersistenceListener(){this.courseManager.onSelectionChange(e=>{this.storageManager.saveSelectedCourses(e)})}persistSelections(){const e=this.getSelectedCourses();this.storageManager.saveSelectedCourses(e)}exportSelections(){const e=this.getSelectedCourses();return JSON.stringify({version:"1.0",timestamp:new Date().toISOString(),selectedCourses:e},null,2)}importSelections(e){try{const t=JSON.parse(e);return t.selectedCourses&&Array.isArray(t.selectedCourses)?(this.courseManager.loadSelectedCourses(t.selectedCourses),!0):!1}catch(t){return console.error("Failed to import selections:",t),!1}}setAllDepartments(e){this.courseManager.setAllDepartments(e)}getAllSections(){return this.courseManager.getAllSections()}getAllSectionsForCourse(e){return this.courseManager.getAllSectionsForCourse(e)}getAllSectionsForDepartment(e){return this.courseManager.getAllSectionsForDepartment(e)}findCourseById(e){for(const t of this.courseManager.getAllDepartments()){const r=t.courses.find(s=>s.id===e);if(r)return r}}unselectCourseById(e){const t=this.findCourseById(e);t&&this.unselectCourse(t)}isCourseSelectedById(e){const t=this.findCourseById(e);return t?this.isCourseSelected(t):!1}setSelectedSectionById(e,t){const r=this.findCourseById(e);r&&this.setSelectedSection(r,t)}getSelectedSectionById(e){const t=this.findCourseById(e);return t?this.getSelectedSection(t):null}getSelectedCourseById(e){const t=this.findCourseById(e);return t?this.getSelectedCourse(t):void 0}reconstructSectionObjects(){this.courseManager.reconstructSectionObjects()}}var R=(d=>(d.TIME_OVERLAP="time_overlap",d))(R||{});class ve{constructor(){this.conflictCache=new Map}detectConflicts(e){const t=[];for(let r=0;r<e.length;r++)for(let s=r+1;s<e.length;s++){const i=this.getCacheKey(e[r],e[s]);let o=this.conflictCache.get(i);o||(o=this.checkSectionConflicts(e[r],e[s]),this.conflictCache.set(i,o)),t.push(...o)}return t}checkSectionConflicts(e,t){const r=[];for(const s of e.periods)for(const i of t.periods){const o=this.checkPeriodConflict(s,i,e,t);o&&r.push(o)}return r}checkPeriodConflict(e,t,r,s){const i=this.getSharedDays(e.days,t.days);return i.length===0?null:this.hasTimeOverlap(e,t)?{section1:r,section2:s,conflictType:R.TIME_OVERLAP,description:`Time overlap on ${i.join(", ")}: ${e.startTime.displayTime}-${e.endTime.displayTime} conflicts with ${t.startTime.displayTime}-${t.endTime.displayTime}`}:null}getSharedDays(e,t){return Array.from(new Set([...e].filter(r=>t.has(r))))}hasTimeOverlap(e,t){const r=this.timeToMinutes(e.startTime),s=this.timeToMinutes(e.endTime),i=this.timeToMinutes(t.startTime),o=this.timeToMinutes(t.endTime);return r<o&&i<s}timeToMinutes(e){return e.hours*60+e.minutes}isValidSchedule(e){return this.detectConflicts(e).length===0}clearCache(){this.conflictCache.clear()}getCacheKey(e,t){const r=`${e.crn}-${t.crn}`,s=`${t.crn}-${e.crn}`;return r<s?r:s}}class Se{constructor(){this.modals=new Map,this.currentZIndex=1e3}showModal(e,t){this.hideModal(e),t.style.zIndex=this.currentZIndex.toString(),this.currentZIndex+=10,this.modals.set(e,t),document.body.appendChild(t),requestAnimationFrame(()=>{t.classList.add("show")})}hideModal(e){const t=this.modals.get(e);t&&(t.classList.add("hide"),setTimeout(()=>{t.parentNode&&t.parentNode.removeChild(t),this.modals.delete(e)},200))}hideAllModals(){Array.from(this.modals.keys()).forEach(t=>this.hideModal(t))}isModalOpen(e){return this.modals.has(e)}getOpenModals(){return Array.from(this.modals.keys())}generateId(){return`modal-${Date.now()}-${Math.random().toString(36).substr(2,9)}`}setupModalBehavior(e,t,r={}){const{closeOnBackdrop:s=!0,closeOnEscape:i=!0}=r;if(s&&e.addEventListener("click",o=>{o.target===e&&this.hideModal(t)}),i){const o=n=>{n.key==="Escape"&&(this.hideModal(t),document.removeEventListener("keydown",o))};document.addEventListener("keydown",o)}}}class ye{constructor(){this.allDepartments=[],this.selectedDepartment=null,this.departmentSyncService=null,this.departmentCategories={BB:"Science",BCB:"Science",CH:"Science",CS:"Science",DS:"Science",GE:"Science",IMGD:"Science",MA:"Science",MTE:"Science",PTE:"Science",NE:"Science",PH:"Science",AE:"Engineering",AR:"Engineering",ARE:"Engineering",BME:"Engineering",CE:"Engineering",CHE:"Engineering",ECE:"Engineering",ES:"Engineering",FP:"Engineering",ME:"Engineering",MFE:"Engineering",MSE:"Engineering",NUE:"Engineering",RBE:"Engineering",SYE:"Engineering",BUS:"Business & Management",ECON:"Business & Management",MIS:"Business & Management",OIE:"Business & Management",EN:"Humanities & Arts",HI:"Humanities & Arts",HU:"Humanities & Arts",MU:"Humanities & Arts",RE:"Humanities & Arts",SP:"Humanities & Arts",TH:"Humanities & Arts",WR:"Humanities & Arts",GOV:"Social Sciences",PSY:"Social Sciences",SOC:"Social Sciences",SS:"Social Sciences"}}setDepartmentSyncService(e){this.departmentSyncService=e}setAllDepartments(e){this.allDepartments=e}getSelectedDepartment(){return this.selectedDepartment}getDepartmentById(e){return this.allDepartments.find(t=>t.abbreviation===e)||null}selectDepartment(e){const t=this.allDepartments.find(s=>s.abbreviation===e);if(!t)return null;this.selectedDepartment=t;const r=document.querySelector(".content-header h2");return r&&(r.textContent=`${t.name} Courses`),t}displayDepartments(){const e=document.getElementById("department-list");if(!e)return;const t=this.groupDepartmentsByCategory();let r="";Object.entries(t).forEach(([s,i])=>{i.length!==0&&(r+=`
                <div class="department-category">
                    <div class="category-header">${s}</div>
                    <div class="department-list">
            `,i.forEach(o=>{const n=o.courses.length;r+=`
                    <div class="department-item" data-dept-id="${o.abbreviation}">
                        ${o.name} (${n})
                    </div>
                `}),r+=`
                    </div>
                </div>
            `)}),e.innerHTML=r}groupDepartmentsByCategory(){const e={Science:[],Engineering:[],"Business & Management":[],"Humanities & Arts":[],"Social Sciences":[],Other:[]};return this.allDepartments.forEach(t=>{const r=this.departmentCategories[t.abbreviation]||"Other";e[r].push(t)}),Object.keys(e).forEach(t=>{e[t].sort((r,s)=>r.name.localeCompare(s.name))}),e}handleDepartmentClick(e,t=!1){const r=this.allDepartments.find(s=>s.abbreviation===e);if(!r)return null;if(this.departmentSyncService)this.departmentSyncService.syncSidebarToFilter(e,t);else{this.selectDepartment(e),document.querySelectorAll(".department-item").forEach(i=>{i.classList.remove("active")});const s=document.querySelector(`[data-dept-id="${e}"]`);s&&s.classList.add("active")}return r}clearDepartmentSelection(){this.selectedDepartment=null,document.querySelectorAll(".department-item").forEach(r=>{r.classList.remove("active")});const e=document.querySelector(".sidebar-header h2");e&&(e.textContent="Departments");const t=document.getElementById("department-list");t&&t.classList.remove("multi-select-active")}}class be{constructor(){this._cancelled=!1}get isCancelled(){return this._cancelled}get reason(){return this._reason}cancel(e){this._cancelled=!0,this._reason=e}throwIfCancelled(){if(this._cancelled)throw new D(this._reason||"Operation was cancelled")}}class D extends Error{constructor(e="Operation was cancelled"){super(e),this.name="CancellationError"}}class Ce{constructor(){this._token=new be}get token(){return this._token}cancel(e){this._token.cancel(e)}}class we{constructor(){this.activeOperations=new Map}startOperation(e,t){this.cancelOperation(e,t);const r=new Ce;return this.activeOperations.set(e,r),r.token}cancelOperation(e,t){const r=this.activeOperations.get(e);r&&(r.cancel(t||"New operation started"),this.activeOperations.delete(e))}cancelAllOperations(e){for(const[t,r]of this.activeOperations)r.cancel(e||"All operations cancelled");this.activeOperations.clear()}isOperationActive(e){return this.activeOperations.has(e)}getActiveOperationCount(){return this.activeOperations.size}completeOperation(e){this.activeOperations.delete(e)}}class Te{constructor(e,t,r=300){this.delay=r,this.timeoutId=null,this.operationManager=e,this.operationId=t}execute(e){return new Promise((t,r)=>{this.timeoutId!==null&&clearTimeout(this.timeoutId),this.timeoutId=window.setTimeout(async()=>{try{const s=this.operationManager.startOperation(this.operationId,"Debounced operation"),i=await e(s);this.operationManager.completeOperation(this.operationId),t(i)}catch(s){if(s instanceof D)return;r(s)}},this.delay)})}cancel(){this.timeoutId!==null&&(clearTimeout(this.timeoutId),this.timeoutId=null),this.operationManager.cancelOperation(this.operationId,"Debounced operation cancelled")}setDelay(e){this.delay=Math.max(0,Math.min(5e3,e))}}class Ee{constructor(e={}){this.options=e,this.batchSize=10,this.batchDelay=16,this.currentRenderToken=null,this.isRendering=!1,this.renderStartTime=0,this.batchSize=e.batchSize||10,this.batchDelay=e.batchDelay||16,this.performanceMetrics=e.performanceMetrics}async renderCoursesBatched(e,t,r,s){if(this.cancelCurrentRender(),e.length===0){t([],!0,!0);return}this.isRendering=!0,this.renderStartTime=performance.now();const i=Date.now()+Math.random();this.currentRenderToken=i;const o=Math.ceil(e.length/this.batchSize),n=this.performanceMetrics?.startOperation("batch-render",{itemCount:e.length,batchSize:this.batchSize,batchCount:o});try{s?.throwIfCancelled();const a=e.slice(0,this.batchSize);if(t(a,!0,e.length<=this.batchSize),this.options.onBatch?.(1,o,e.length),e.length<=this.batchSize){this.completeRender(e.length);return}for(let c=1;c<o;c++){if(this.currentRenderToken!==i||(s?.throwIfCancelled(),await this.wait(this.batchDelay,s),this.currentRenderToken!==i))return;s?.throwIfCancelled();const l=c*this.batchSize,h=Math.min((c+1)*this.batchSize,e.length),v=e.slice(l,h);t(v,!1,c===o-1),this.options.onBatch?.(c+1,o,e.length)}this.completeRender(e.length),n&&this.performanceMetrics?.endOperation(n,{completed:!0,cancelled:!1})}catch(a){if(a instanceof D){this.isRendering=!1,this.currentRenderToken=null,n&&this.performanceMetrics?.endOperation(n,{completed:!1,cancelled:!0});return}console.error("Progressive rendering error:",a),this.isRendering=!1,this.currentRenderToken=null,n&&this.performanceMetrics?.endOperation(n,{completed:!1,cancelled:!1,error:a.message})}}async renderCourseList(e,t,r,s,i){let o="",n=[];const a=(c,l,h)=>{l&&(r.innerHTML='<div class="course-list"></div>',o="",n=[]);const v=c.map(m=>{const p=t.isCourseSelected(m),y=this.courseHasWarning(m);return`
                    <div class="course-item ${p?"selected":""}" data-course-id="${m.id}">
                        <div class="course-header">
                            <button class="course-select-btn ${p?"selected":""}" title="${p?"Remove from selection":"Add to selection"}">
                                ${p?"✓":"+"}
                            </button>
                            <div class="course-code">${m.department.abbreviation}${m.number}</div>
                            <div class="course-details">
                                <div class="course-name">
                                    ${m.name}
                                    ${y?'<span class="warning-icon">⚠</span>':""}
                                </div>
                                <div class="course-sections">
                                    ${m.sections.map(C=>`<span class="section-badge ${C.seatsAvailable<=0?"full":""}" data-section="${C.number}">${C.number}</span>`).join("")}
                                </div>
                            </div>
                        </div>
                    </div>
                `}).join("");o+=v,n.push(...c);const f=r.querySelector(".course-list");if(f&&(f.innerHTML=o,f.querySelectorAll(".course-item").forEach((p,y)=>{y<n.length&&s.set(p,n[y])})),!h&&f){const m=document.createElement("div");m.className="loading-indicator",m.innerHTML=`
                    <div class="loading-spinner"></div>
                    <span>Loading more courses... (${n.length} of ${e.length})</span>
                `,f.appendChild(m)}};await this.renderCoursesBatched(e,a,r,i)}async renderCourseGrid(e,t,r,s,i){let o="",n=[];const a=(c,l,h)=>{l&&(r.innerHTML='<div class="course-grid"></div>',o="",n=[]);const v=c.map(m=>{const p=t.isCourseSelected(m),y=this.courseHasWarning(m),C=m.minCredits===m.maxCredits?m.minCredits:`${m.minCredits}-${m.maxCredits}`;return`
                    <div class="course-card ${p?"selected":""}" data-course-id="${m.id}">
                        <div class="course-card-header">
                            <div class="course-code">${m.department.abbreviation}${m.number}</div>
                            <button class="course-select-btn ${p?"selected":""}" title="${p?"Remove from selection":"Add to selection"}">
                                ${p?"✓":"+"}
                            </button>
                        </div>
                        <div class="course-title">
                            ${m.name}
                            ${y?'<span class="warning-icon">⚠</span>':""}
                        </div>
                        <div class="course-info">
                            <span class="course-credits">${C} credits</span>
                            <span class="course-sections-count">${m.sections.length} section${m.sections.length!==1?"s":""}</span>
                        </div>
                    </div>
                `}).join("");o+=v,n.push(...c);const f=r.querySelector(".course-grid");if(f&&(f.innerHTML=o,f.querySelectorAll(".course-card").forEach((p,y)=>{y<n.length&&s.set(p,n[y])})),!h&&f){const m=document.createElement("div");m.className="loading-indicator grid-loading",m.innerHTML=`
                    <div class="loading-spinner"></div>
                    <span>Loading more courses... (${n.length} of ${e.length})</span>
                `,f.appendChild(m)}};await this.renderCoursesBatched(e,a,r,i)}cancelCurrentRender(){this.currentRenderToken!==null&&(this.currentRenderToken=null,this.isRendering=!1)}isCurrentlyRendering(){return this.isRendering}setBatchSize(e){this.batchSize=Math.max(1,Math.min(100,e))}getBatchSize(){return this.batchSize}setBatchDelay(e){this.batchDelay=Math.max(0,Math.min(100,e))}wait(e,t){return new Promise((r,s)=>{if(t?.isCancelled){s(new D(t.reason));return}const i=setTimeout(()=>{t?.isCancelled?s(new D(t.reason)):r()},e);t?.isCancelled&&(clearTimeout(i),s(new D(t.reason)))})}courseHasWarning(e){return e.sections.every(t=>t.seatsAvailable<=0)}completeRender(e){const t=performance.now()-this.renderStartTime;this.isRendering=!1,this.currentRenderToken=null,this.options.onComplete?.(e,t)}}class xe{constructor(){this.metrics=[],this.maxMetrics=100,this.activeOperations=new Map}startOperation(e,t){const r=`${e}_${Date.now()}_${Math.random()}`;return this.activeOperations.set(r,performance.now()),r}endOperation(e,t){const r=this.activeOperations.get(e);if(!r)return console.warn(`No start time found for operation: ${e}`),null;const s=performance.now(),i=s-r,o={operation:e.split("_")[0],startTime:r,endTime:s,duration:i,metadata:t};return this.addMetric(o),this.activeOperations.delete(e),o}trackOperation(e,t,r){const s=performance.now(),i={operation:e,startTime:s-t,endTime:s,duration:t,metadata:r};this.addMetric(i)}trackFilterOperation(e){this.trackOperation(e.operation,e.duration,{itemCount:e.itemCount,batchSize:e.batchSize,batchCount:e.batchCount,cancelled:e.cancelled})}trackRenderOperation(e,t,r,s){this.trackFilterOperation({operation:"render",itemCount:e,duration:t,batchSize:r,batchCount:s})}trackSearchOperation(e,t,r){this.trackOperation("search",r,{query:e.substring(0,50),queryLength:e.length,resultCount:t})}addMetric(e){this.metrics.push(e),this.metrics.length>this.maxMetrics&&(this.metrics=this.metrics.slice(-this.maxMetrics))}generateReport(e){let t=this.metrics;if(e&&(t=this.metrics.filter(s=>s.operation===e)),t.length===0)return{totalOperations:0,averageDuration:0,minDuration:0,maxDuration:0,operations:[]};const r=t.map(s=>s.duration);return{totalOperations:t.length,averageDuration:r.reduce((s,i)=>s+i,0)/r.length,minDuration:Math.min(...r),maxDuration:Math.max(...r),operations:t}}getRecentMetrics(e=10){return this.metrics.slice(-e)}clearMetrics(){this.metrics=[],this.activeOperations.clear()}getMetricsSummary(){const e=this.generateReport();return e.totalOperations===0?"No performance metrics collected":`Performance Summary:
- Total Operations: ${e.totalOperations}
- Average Duration: ${e.averageDuration.toFixed(2)}ms
- Min Duration: ${e.minDuration.toFixed(2)}ms
- Max Duration: ${e.maxDuration.toFixed(2)}ms`}logSummary(){console.log(this.getMetricsSummary())}isPerformanceDegraded(e,t=1e3){const r=this.generateReport(e);return r.averageDuration>t||r.maxDuration>t*2}getInsights(){const e=[],t=this.generateReport();if(t.totalOperations===0)return["No performance data available"];t.averageDuration>500&&e.push(`Average operation time (${t.averageDuration.toFixed(2)}ms) is high - consider optimization`),t.maxDuration>2e3&&e.push(`Slowest operation (${t.maxDuration.toFixed(2)}ms) is very slow - investigate bottlenecks`);const r=this.generateReport("render");r.totalOperations>0&&r.averageDuration>300&&e.push(`Rendering performance could be improved (avg: ${r.averageDuration.toFixed(2)}ms)`);const s=this.generateReport("search");return s.totalOperations>0&&s.averageDuration>200&&e.push(`Search performance could be improved (avg: ${s.averageDuration.toFixed(2)}ms)`),e.length===0&&e.push("Performance looks good!"),e}getOptimalBatchSize(e=10){const t=this.generateReport("render");if(t.totalOperations<3)return e;const r=t.averageDuration;return r<50?Math.min(e+5,50):r>200?Math.max(e-2,5):e}}class $e{constructor(e){this.allDepartments=[],this.selectedCourse=null,this.filterService=null,this.elementToCourseMap=new WeakMap,this.courseSelectionService=e,this.performanceMetrics=new xe;const t={batchSize:10,batchDelay:16,performanceMetrics:this.performanceMetrics,onBatch:(r,s,i)=>{console.log(`Rendered batch ${r}/${s} (${i} total courses)`)},onComplete:(r,s)=>{if(console.log(`Progressive rendering complete: ${r} courses in ${s.toFixed(2)}ms`),Math.random()<.1){const i=this.performanceMetrics.getInsights();console.log("Performance insights:",i.join(", "));const o=this.performanceMetrics.getOptimalBatchSize(this.progressiveRenderer.getBatchSize());o!==this.progressiveRenderer.getBatchSize()&&(console.log(`Adjusting batch size from ${this.progressiveRenderer.getBatchSize()} to ${o}`),this.progressiveRenderer.setBatchSize(o))}}};this.progressiveRenderer=new Ee(t)}setFilterService(e){this.filterService=e}setAllDepartments(e){this.allDepartments=e}getSelectedCourse(){return this.selectedCourse}async displayCourses(e,t){return this.displayCoursesWithCancellation(e,t)}async displayCoursesWithCancellation(e,t,r){this.progressiveRenderer.cancelCurrentRender(),t==="grid"?await this.displayCoursesGrid(e,r):await this.displayCoursesList(e,r)}async displayCoursesList(e,t){const r=document.getElementById("course-container");if(!r)return;if(e.length===0){r.innerHTML='<div class="empty-state">No courses found in this department.</div>';return}const s=e.sort((i,o)=>i.number.localeCompare(o.number));await this.progressiveRenderer.renderCourseList(s,this.courseSelectionService,r,this.elementToCourseMap,t)}async displayCoursesGrid(e,t){const r=document.getElementById("course-container");if(!r)return;if(e.length===0){r.innerHTML='<div class="empty-state">No courses found in this department.</div>';return}const s=e.sort((i,o)=>i.number.localeCompare(o.number));await this.progressiveRenderer.renderCourseGrid(s,this.courseSelectionService,r,this.elementToCourseMap,t)}courseHasWarning(e){return e.sections.every(t=>t.seatsAvailable<=0)}handleSearch(e,t){const r=t?t.courses:this.getAllCourses();if(this.filterService){const i=this.filterService.searchAndFilter(e,r);return this.updateSearchHeader(e,i.length,t),i}if(!e.trim())return r;const s=r.filter(i=>i.name.toLowerCase().includes(e.toLowerCase())||i.number.toLowerCase().includes(e.toLowerCase())||i.id.toLowerCase().includes(e.toLowerCase()));return this.updateSearchHeader(e,s.length,t),s}handleFilter(e){const t=e?e.courses:this.getAllCourses();if(this.filterService&&!this.filterService.isEmpty()){const r=this.filterService.filterCourses(t);return this.updateFilterHeader(r.length,e),r}return t}getAllCourses(){const e=[];return this.allDepartments.forEach(t=>{e.push(...t.courses)}),e}updateSearchHeader(e,t,r){const s=document.querySelector(".content-header h2");s&&(e.trim()?s.textContent=`Search Results (${t})`:r?s.textContent=`${r.name} (${t})`:s.textContent=`All Courses (${t})`)}updateFilterHeader(e,t){const r=document.querySelector(".content-header h2");if(r){let s=t?t.name:"All Courses";if(this.filterService&&!this.filterService.isEmpty()){const i=this.filterService.getFilterSummary();s+=` (${e}) - ${i}`}else s+=` (${e})`;r.textContent=s}}selectCourse(e){const t=this.elementToCourseMap.get(e);return t?(this.selectedCourse=t,this.displayCourseDescription(t),document.querySelectorAll(".course-item, .course-card").forEach(r=>{r.classList.remove("active")}),e.classList.add("active"),t):null}selectCourseById(e){if(!this.courseSelectionService.findCourseById(e))return null;const r=document.querySelectorAll(".course-item, .course-card");for(const s of r)if(this.elementToCourseMap.get(s)?.id===e)return this.selectCourse(s);return null}toggleCourseSelection(e){const t=this.elementToCourseMap.get(e);if(!t)return!1;const r=this.courseSelectionService.toggleCourseSelection(t);return this.updateCourseSelectionUI(e,r),r}toggleCourseSelectionById(e){if(!this.courseSelectionService.findCourseById(e))return!1;const r=document.querySelectorAll(".course-item, .course-card");for(const s of r)if(this.elementToCourseMap.get(s)?.id===e)return this.toggleCourseSelection(s);return!1}updateCourseSelectionUI(e,t){const r=e.querySelector(".course-select-btn");r&&(t?(e.classList.add("selected"),r.textContent="✓",r.classList.add("selected")):(e.classList.remove("selected"),r.textContent="+",r.classList.remove("selected")))}refreshCourseSelectionUI(){document.querySelectorAll(".course-item, .course-card").forEach(e=>{const t=this.elementToCourseMap.get(e);if(t){const r=this.courseSelectionService.isCourseSelected(t);this.updateCourseSelectionUI(e,r)}})}displayCourseDescription(e){const t=document.getElementById("course-description");if(!t)return;const r=`
            <div class="course-info">
                <div class="course-title">${e.name}</div>
                <div class="course-code">${e.department.abbreviation}${e.number} (${e.minCredits===e.maxCredits?e.minCredits:`${e.minCredits}-${e.maxCredits}`} credits)</div>
            </div>
            <div class="course-description-text">${e.description}</div>
        `;t.innerHTML=r}clearCourseDescription(){const e=document.getElementById("course-description");e&&(e.innerHTML='<div class="empty-state">Select a course to view description</div>')}clearCourseSelection(){this.selectedCourse=null,this.clearCourseDescription()}displaySelectedCourses(){const e=document.getElementById("selected-courses-list"),t=document.getElementById("selected-count");if(!e||!t)return;const r=this.courseSelectionService.getSelectedCourses();if(t.textContent=`(${r.length})`,r.length===0){e.innerHTML='<div class="empty-state">No courses selected yet</div>';return}const s=r.sort((n,a)=>{const c=n.course.department.abbreviation.localeCompare(a.course.department.abbreviation);return c!==0?c:n.course.number.localeCompare(a.course.number)});let i="";s.forEach(n=>{const a=n.course,c=a.minCredits===a.maxCredits?`${a.minCredits} credits`:`${a.minCredits}-${a.maxCredits} credits`;i+=`
                <div class="selected-course-item">
                    <div class="selected-course-info">
                        <div class="selected-course-code">${a.department.abbreviation}${a.number}</div>
                        <div class="selected-course-name">${a.name}</div>
                        <div class="selected-course-credits">${c}</div>
                    </div>
                    <button class="course-remove-btn" title="Remove from selection">
                        ×
                    </button>
                </div>
            `}),e.innerHTML=i,e.querySelectorAll(".course-remove-btn").forEach((n,a)=>{this.elementToCourseMap.set(n,s[a].course)})}getCourseFromElement(e){return this.elementToCourseMap.get(e)}}const g=class g{static timeToGridRow(e){return g.timeToGridRowStart(e)}static timeToGridRowStart(e){const t=e.hours*60+e.minutes,r=g.START_HOUR*60,s=t-r,i=Math.floor(s/30);return Math.max(0,Math.min(i,g.TOTAL_TIME_SLOTS-1))}static timeToGridRowEnd(e){const t=e.hours*60+e.minutes,r=g.START_HOUR*60,s=t-r,i=Math.ceil(s/30),o=Math.max(0,Math.min(i,g.TOTAL_TIME_SLOTS-1));return s%30!==0&&console.log(`Rounded UP: ${e.hours}:${e.minutes.toString().padStart(2,"0")} -> slot ${i} (${s} min = ${s/30} slots)`),o}static dayToGridColumn(e){return g.DAYS_ORDER.indexOf(e)}static calculateDuration(e,t){const r=g.timeToGridRow(e),s=g.timeToGridRow(t);return Math.max(1,s-r)}static isTimeInBounds(e){return e.hours>=g.START_HOUR&&e.hours<g.END_HOUR}static formatTime(e){if(e.displayTime)return e.displayTime;const t=e.hours===0?12:e.hours>12?e.hours-12:e.hours,r=e.hours>=12?"PM":"AM",s=e.minutes.toString().padStart(2,"0");return`${t}:${s} ${r}`}static formatTimeRange(e,t){const r=g.formatTime(e),s=g.formatTime(t);return e.hours<12&&t.hours<12?`${r.replace(" AM","")}-${s}`:e.hours>=12&&t.hours>=12?`${r.replace(" PM","")}-${s}`:`${r}-${s}`}static formatDays(e){const t={[u.MONDAY]:"M",[u.TUESDAY]:"T",[u.WEDNESDAY]:"W",[u.THURSDAY]:"R",[u.FRIDAY]:"F",[u.SATURDAY]:"S",[u.SUNDAY]:"U"};return g.DAYS_ORDER.filter(r=>e.has(r)).map(r=>t[r]).join("")}static generateTimeLabels(){const e=[];for(let t=0;t<g.TOTAL_TIME_SLOTS;t++){const r=Math.floor(t/g.SLOTS_PER_HOUR)+g.START_HOUR,s=t%g.SLOTS_PER_HOUR*30;e.push(g.formatTime({hours:r,minutes:s,displayTime:""}))}return e}static getDayName(e){return{[u.MONDAY]:"Monday",[u.TUESDAY]:"Tuesday",[u.WEDNESDAY]:"Wednesday",[u.THURSDAY]:"Thursday",[u.FRIDAY]:"Friday",[u.SATURDAY]:"Saturday",[u.SUNDAY]:"Sunday"}[e]}static getDayAbbr(e){return{[u.MONDAY]:"Mon",[u.TUESDAY]:"Tue",[u.WEDNESDAY]:"Wed",[u.THURSDAY]:"Thu",[u.FRIDAY]:"Fri",[u.SATURDAY]:"Sat",[u.SUNDAY]:"Sun"}[e]}};g.START_HOUR=7,g.END_HOUR=19,g.TOTAL_HOURS=12,g.SLOTS_PER_HOUR=2,g.TOTAL_TIME_SLOTS=g.TOTAL_HOURS*g.SLOTS_PER_HOUR,g.DAYS_ORDER=[u.MONDAY,u.TUESDAY,u.WEDNESDAY,u.THURSDAY,u.FRIDAY,u.SATURDAY,u.SUNDAY];let w=g;class Ae{constructor(e){this.sectionInfoModalController=null,this.elementToCourseMap=new WeakMap,this.courseSelectionService=e}setSectionInfoModalController(e){this.sectionInfoModalController=e}setStatePreserver(e){this.statePreserver=e}displayScheduleSelectedCourses(){const e=document.getElementById("schedule-selected-courses"),t=document.getElementById("schedule-selected-count");if(!e||!t)return;const r=this.statePreserver?.preserve(),s=this.courseSelectionService.getSelectedCourses();if(t.textContent=`(${s.length})`,s.length===0){e.innerHTML='<div class="empty-state">No courses selected yet</div>';return}const i=s.sort((l,h)=>{const v=l.course.department.abbreviation.localeCompare(h.course.department.abbreviation);return v!==0?v:l.course.number.localeCompare(h.course.number)});let o="";i.forEach(l=>{const h=l.course,v=h.minCredits===h.maxCredits?`${h.minCredits} credits`:`${h.minCredits}-${h.maxCredits} credits`,f={};h.sections.forEach(p=>{f[p.term]||(f[p.term]=[]),f[p.term].push(p)}),o+=`
                <div class="schedule-course-item collapsed" >
                    <div class="schedule-course-header dropdown-trigger" >
                        <div class="schedule-course-info">
                            <div class="schedule-course-code">${h.department.abbreviation}${h.number}</div>
                            <div class="schedule-course-name">${h.name}</div>
                            <div class="schedule-course-credits">${v}</div>
                        </div>
                        <div class="header-controls">
                            <span class="dropdown-arrow">▼</span>
                            <button class="course-remove-btn"  title="Remove from selection">
                                ×
                            </button>
                        </div>
                    </div>
                    <div class="schedule-sections-container">
            `,Object.keys(f).sort().forEach(p=>{o+=`<div class="term-sections" data-term="${p}">`,o+=`<div class="term-label">${p} Term</div>`,f[p].forEach(y=>{const C=l.selectedSectionNumber===y.number,A=C?"selected":"",L=[...y.periods].sort((S,F)=>{const E=I=>{const x=I.toLowerCase();return x.includes("lec")||x.includes("lecture")?1:x.includes("lab")?2:x.includes("dis")||x.includes("discussion")||x.includes("rec")?3:4};return E(S.type)-E(F.type)});o+=`
                        <div class="section-option ${A}"  data-section="${y.number}">
                            <div class="section-info">
                                <div class="section-number">${y.number}</div>
                                <div class="section-periods">`,L.forEach((S,F)=>{const E=w.formatTimeRange(S.startTime,S.endTime),I=w.formatDays(S.days),x=this.getPeriodTypeLabel(S.type);o+=`
                            <div class="period-info" data-period-type="${S.type.toLowerCase()}">
                                <div class="period-header">
                                    <span class="period-type-label">${x}</span>
                                    <span class="period-schedule">${I} ${E}</span>
                                </div>
                            </div>
                        `}),o+=`
                                </div>
                            </div>
                            <button class="section-select-btn ${A}"  data-section="${y.number}">
                                ${C?"✓":"+"}
                            </button>
                        </div>
                    `}),o+="</div>"}),o+=`
                    </div>
                </div>
            `}),e.innerHTML=o;const n=e.querySelectorAll(".schedule-course-item"),a=e.querySelectorAll(".course-remove-btn");n.forEach((l,h)=>{const v=i[h]?.course;this.elementToCourseMap.set(l,v)}),a.forEach((l,h)=>{const v=i[h]?.course;this.elementToCourseMap.set(l,v)}),e.querySelectorAll(".section-select-btn").forEach(l=>{const h=l.closest(".schedule-course-item");if(h){const v=Array.from(n).indexOf(h);if(v>=0&&v<i.length){const f=i[v].course;this.elementToCourseMap.set(l,f)}}}),r&&setTimeout(()=>{this.statePreserver?.restore(r)},0)}handleSectionSelection(e,t){this.courseSelectionService.getSelectedSection(e)===t?this.courseSelectionService.setSelectedSection(e,null):this.courseSelectionService.setSelectedSection(e,t)}updateSectionButtonStates(e,t){let r=null;if(document.querySelectorAll(".schedule-course-item").forEach(o=>{const n=this.elementToCourseMap.get(o);n&&n.id===e.id&&(r=o)}),!r)return;const s=r.querySelectorAll(".section-select-btn"),i=r.querySelectorAll(".section-option");s.forEach(o=>{o.dataset.section===t?(o.classList.add("selected"),o.textContent="✓"):(o.classList.remove("selected"),o.textContent="+")}),i.forEach(o=>{o.dataset.section===t?o.classList.add("selected"):o.classList.remove("selected")})}renderScheduleGrids(){const e=this.courseSelectionService.getSelectedCourses(),t=["A","B","C","D"];console.log(`
=== RENDER SCHEDULE GRIDS ===`),console.log(`Processing ${e.length} selected courses for terms: ${t.join(", ")}`),t.forEach(r=>{const s=document.getElementById(`schedule-grid-${r}`);if(!s)return;const i=e.filter(o=>{if(!(o.selectedSection!==null))return!1;console.log(`  Checking course ${o.course.department.abbreviation}${o.course.number} with term "${o.selectedSection.term}" against grid term "${r}"`);const a=this.extractTermLetter(o.selectedSection.term,o.selectedSection.number),c=a===r;return console.log(`    Extracted term letter: "${a}" from term:"${o.selectedSection.term}" section:"${o.selectedSection.number}"`),c});if(console.log(`Term ${r}: ${i.length} courses`),i.forEach(o=>{console.log(`  ${o.course.department.abbreviation}${o.course.number} (${o.selectedSection.periods.length} periods)`)}),i.length===0){const o=e.filter(n=>!n.selectedSection);this.renderEmptyGrid(s,r,o.length>0);return}this.renderPopulatedGrid(s,i,r)}),console.log(`=== END RENDER SCHEDULE GRIDS ===
`)}renderEmptyGrid(e,t,r=!1){const s=r?`No sections selected for ${t} term<br><small>Select specific sections in the left panel to see schedule</small>`:`No classes scheduled for ${t} term`;e.innerHTML=`
            <div class="empty-schedule">
                <div class="empty-message">${s}</div>
            </div>
        `,e.classList.add("empty")}renderPopulatedGrid(e,t,r){e.classList.remove("empty");const s=[u.MONDAY,u.TUESDAY,u.WEDNESDAY,u.THURSDAY,u.FRIDAY],i=w.TOTAL_TIME_SLOTS;let o="";o+='<div class="time-label"></div>',s.forEach(n=>{o+=`<div class="day-header">${w.getDayAbbr(n)}</div>`});for(let n=0;n<i;n++){const a=Math.floor(n/w.SLOTS_PER_HOUR)+w.START_HOUR,c=n%w.SLOTS_PER_HOUR*30,l=w.formatTime({hours:a,minutes:c,displayTime:""});o+=`<div class="time-label">${l}</div>`,s.forEach(h=>{const v=this.getCellContent(t,h,n);o+=`<div class="schedule-cell ${v.classes}" data-day="${h}" data-slot="${n}" style="position: relative;">${v.content}</div>`})}e.innerHTML=o,this.addSectionBlockEventListeners(e)}getCellContent(e,t,r){const s=[],i=r<12&&e.length>0;if(i&&e.length>0){const f=Math.floor(r/2)+7,m=r%2*30;console.log(`
--- getCellContent: ${t} ${f}:${m.toString().padStart(2,"0")} (slot ${r}) ---`),console.log(`Checking ${e.length} courses for this time slot`)}for(const f of e){if(!f.selectedSection)continue;const m=f.selectedSection,p=m.periods.filter(S=>S.days.has(t));i&&p.length>0&&(console.log(`  Course ${f.course.department.abbreviation}${f.course.number} has ${p.length} periods on ${t}:`),p.forEach(S=>{console.log(`    ${S.type}: ${S.startTime.hours}:${S.startTime.minutes.toString().padStart(2,"0")}-${S.endTime.hours}:${S.endTime.minutes.toString().padStart(2,"0")}`)}));let y=!1,C=1/0,A=-1,L=!1;for(const S of p){const F=w.timeToGridRowStart(S.startTime),E=w.timeToGridRowEnd(S.endTime);i&&console.log(`    Checking period ${S.type}: slots ${F}-${E} vs current slot ${r}`),r>=F&&r<E&&(y=!0,C=Math.min(C,F),A=Math.max(A,E),i&&console.log(`      ✓ MATCHES! Period occupies slot ${r}`))}y&&(L=r===C,i&&console.log(`    Course ${f.course.department.abbreviation}${f.course.number} occupies slot, isFirstSlot: ${L}`),s.push({course:f,section:m,periodsOnThisDay:p,startSlot:C,endSlot:A,isFirstSlot:L}))}if(s.length===0)return{content:"",classes:""};const o=s.length>1,n=s[0],a=this.getCourseColor(n.course.course.id),c=n.endSlot-n.startSlot,l=c*30;console.log(`Course ${n.course.course.department.abbreviation}${n.course.course.number} should span ${c} rows (${l}px) from slot ${n.startSlot} to ${n.endSlot}`);const h=n.isFirstSlot?`
            <div class="section-block ${o?"conflict":""}" 
                 data-course-id="${n.course.course.id}"
                 data-section-number="${n.course.selectedSectionNumber||""}"
                 data-selected-course-index="${n.courseIndex||0}"
                 style="
                background-color: ${a}; 
                height: ${l}px;
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
                ${n.course.course.department.abbreviation}${n.course.course.number}
            </div>
        `:"",v=n.isFirstSlot?`occupied section-start ${o?"has-conflict":""}`:"";return{content:h,classes:v}}formatSectionPeriods(e){if(e.length===0)return"";const t={};for(const o of e){const n=this.getPeriodTypeLabel(o.type);t[n]||(t[n]=[]),t[n].push(o)}const r=[],s=["LEC","LAB","DIS","REC","SEM","STU","CONF"],i=Object.keys(t).sort((o,n)=>{const a=s.indexOf(o),c=s.indexOf(n);return(a===-1?999:a)-(c===-1?999:c)});for(const o of i){const a=t[o].map(c=>w.formatTimeRange(c.startTime,c.endTime)).join(", ");r.push(`<div class="period-type-info">
                <span class="period-type">${o}</span>
                <span class="period-times">${a}</span>
            </div>`)}return r.join("")}getCourseColor(e){const t=["#4CAF50","#2196F3","#FF9800","#9C27B0","#F44336","#00BCD4","#795548","#607D8B","#3F51B5","#E91E63"];let r=0;for(let s=0;s<e.length;s++)r=e.charCodeAt(s)+((r<<5)-r);return t[Math.abs(r)%t.length]}getPeriodTypeLabel(e){const t=e.toLowerCase();return t.includes("lec")||t.includes("lecture")?"LEC":t.includes("lab")?"LAB":t.includes("dis")||t.includes("discussion")?"DIS":t.includes("rec")||t.includes("recitation")?"REC":t.includes("sem")||t.includes("seminar")?"SEM":t.includes("studio")?"STU":t.includes("conference")||t.includes("conf")?"CONF":e.substring(0,Math.min(4,e.length)).toUpperCase()}getPeriodTypeClass(e){const t=e.toLowerCase();return t.includes("lec")||t.includes("lecture")?"period-lecture":t.includes("lab")?"period-lab":t.includes("dis")||t.includes("discussion")?"period-discussion":t.includes("rec")||t.includes("recitation")?"period-recitation":t.includes("sem")||t.includes("seminar")?"period-seminar":t.includes("studio")?"period-studio":t.includes("conference")||t.includes("conf")?"period-conference":"period-other"}getCourseFromElement(e){return this.elementToCourseMap.get(e)}extractTermLetter(e,t){if(t){const r=t.match(/^([ABCD])/i);if(r)return r[1].toUpperCase()}if(e){const r=e.match(/\b([ABCD])\s+Term/i);if(r)return r[1].toUpperCase()}return"A"}addSectionBlockEventListeners(e){e.addEventListener("click",t=>{const s=t.target.closest(".section-block");if(!s)return;const i=s.dataset.courseId,o=s.dataset.sectionNumber;i&&o&&(t.stopPropagation(),this.showSectionInfoModal(i,o))})}showSectionInfoModal(e,t){if(!this.sectionInfoModalController){console.warn("Section info modal controller not available");return}const s=this.courseSelectionService.getSelectedCourses().find(a=>a.course.id===e);if(!s||!s.selectedSection){console.warn("Course or section not found:",e,t);return}const i=s.course,o=s.selectedSection,n={courseCode:`${i.department.abbreviation}${i.number}`,courseName:i.name,section:o,course:i};this.sectionInfoModalController.show(n)}}class Fe{constructor(e){this.modalService=e}show(e){const t=this.modalService.generateId(),r=this.createModalElement(t,e);return this.modalService.showModal(t,r),this.modalService.setupModalBehavior(r,t),t}createModalElement(e,t){const r=document.createElement("div");r.className="modal-backdrop",r.id=e;const s=document.createElement("style");s.textContent=this.getModalCSS(),r.appendChild(s),r.innerHTML+=`
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
        `;const i=r.querySelector(".modal-dialog");return i&&i.addEventListener("click",o=>{o.stopPropagation()}),r}generateModalBody(e){const t=e.section.seatsAvailable>0?`${e.section.seatsAvailable} seats available`:"Full",r=e.section.maxWaitlist>0?`Waitlist: ${e.section.actualWaitlist}/${e.section.maxWaitlist}`:"",s=e.section.periods.map(i=>{const n=Array.from(i.days).sort().join(", ").toUpperCase(),a=`${i.startTime.displayTime} - ${i.endTime.displayTime}`,c=i.building&&i.room?`${i.building} ${i.room}`:i.location||"TBA";return`
                <div class="period-info">
                    <div class="period-type">${this.getPeriodTypeLabel(i.type)}</div>
                    <div class="period-schedule">
                        <div>${n} ${a}</div>
                        <div class="period-location">${c}</div>
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
                    ${r?`<div class="waitlist-info">${r}</div>`:""}
                </div>
                
                <div class="section-meetings">
                    <h4>Meeting Times</h4>
                    ${s}
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
        `}}class Me{constructor(e){this.modalService=e}show(e,t,r="info"){const s=this.modalService.generateId(),i=this.createModalElement(s,e,t,r);return this.modalService.showModal(s,i),this.modalService.setupModalBehavior(i,s),s}showInfo(e,t){return this.show(e,t,"info")}showWarning(e,t){return this.show(e,t,"warning")}showError(e,t){return this.show(e,t,"error")}showSuccess(e,t){return this.show(e,t,"success")}createModalElement(e,t,r,s){const i=document.createElement("div");i.className="modal-backdrop",i.id=e;const o=document.createElement("style");o.textContent=this.getModalCSS(),i.appendChild(o),i.innerHTML+=`
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header ${s}">
                        <h3 class="modal-title">${t}</h3>
                        <button class="modal-close" onclick="document.getElementById('${e}').click()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="modal-icon ${s}">
                            ${this.getIconForType(s)}
                        </div>
                        <div class="modal-text">
                            ${r}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="modal-btn btn-${this.getButtonStyleForType(s)}" onclick="document.getElementById('${e}').click()">OK</button>
                    </div>
                </div>
            </div>
        `;const n=i.querySelector(".modal-dialog");return n&&n.addEventListener("click",a=>{a.stopPropagation()}),i}getIconForType(e){switch(e){case"info":return"ℹ";case"warning":return"⚠";case"error":return"✖";case"success":return"✓";default:return"ℹ"}}getButtonStyleForType(e){switch(e){case"error":return"danger";case"warning":return"warning";case"success":return"success";case"info":default:return"primary"}}getModalCSS(){return`
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
        `}}class De{constructor(e){this.filterService=null,this.allCourses=[],this.allDepartments=[],this.currentModalId=null,this.modalService=e}setFilterService(e){this.filterService=e}setCourseData(e){this.allDepartments=e,this.allCourses=[],e.forEach(t=>{this.allCourses.push(...t.courses)})}syncSearchInputFromMain(e){if(this.currentModalId){const t=document.getElementById(this.currentModalId);if(t){const r=t.querySelector(".search-text-input");r&&r.value!==e&&(r.value=e,this.updateClearSearchButton(t,e))}}}refreshDepartmentSelection(){if(this.currentModalId){const e=document.getElementById(this.currentModalId);e&&this.updateDepartmentCheckboxes(e)}}updateDepartmentCheckboxes(e){if(!this.filterService)return;const r=this.filterService.getActiveFilters().find(i=>i.id==="department")?.criteria?.departments||[];e.querySelectorAll('input[data-filter="department"]').forEach(i=>{i.checked=r.includes(i.value)}),this.updatePreview(e)}show(){if(!this.filterService)return console.error("FilterService not set on FilterModalController"),"";const e=this.modalService.generateId();this.currentModalId=e;const t=this.createModalElement(e);return this.modalService.showModal(e,t),this.modalService.setupModalBehavior(t,e,{closeOnBackdrop:!0,closeOnEscape:!0}),setTimeout(()=>this.initializeFilterUI(t),50),e}createModalElement(e){const t=document.createElement("div");t.className="modal-backdrop filter-modal",t.id=e;const r=this.filterService?.getFilterCount()||0,s=this.filterService?this.filterService.filterCourses(this.allCourses).length:this.allCourses.length;t.innerHTML=`
            <div class="modal-dialog filter-modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">
                            Filter Courses 
                            <span id="filter-count" class="filter-count">${r>0?`(${r})`:""}</span>
                        </h3>
                        <button class="modal-close" onclick="document.getElementById('${e}').click()">×</button>
                    </div>
                    <div class="modal-body filter-modal-body">
                        ${this.createFilterSections()}
                    </div>
                    <div class="modal-footer">
                        <div class="filter-preview">
                            <span id="course-count-preview">${s} courses match current filters</span>
                        </div>
                        <div class="filter-actions">
                            <button class="modal-btn btn-secondary" id="clear-all-filters">Clear All</button>
                            <button class="modal-btn btn-primary" onclick="document.getElementById('${e}').click()">Apply</button>
                        </div>
                    </div>
                </div>
            </div>
        `;const i=t.querySelector(".modal-dialog");return i&&i.addEventListener("click",o=>{o.stopPropagation()}),t}createFilterSections(){return`
            <div class="filter-sections">
                ${this.createSearchTextFilter()}
                ${this.createDepartmentFilter()}
                ${this.createAvailabilityFilter()}
                ${this.createCreditRangeFilter()}
                ${this.createProfessorFilter()}
                ${this.createTermFilter()}
                ${this.createLocationFilter()}
            </div>
        `}createSearchTextFilter(){if(!this.filterService)return"";const t=this.filterService.getActiveFilters().find(r=>r.id==="searchText")?.criteria?.query||"";return`
            <div class="filter-section search-text-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Search Text</h4>
                    <button class="filter-clear-search" ${t?"":'style="display: none;"'}>Clear</button>
                </div>
                <div class="filter-section-content">
                    <div class="filter-search-container">
                        <input type="text" class="filter-search search-text-input" 
                               placeholder="Search courses..." 
                               value="${this.escapeHtml(t)}"
                               data-filter="searchText">
                    </div>
                </div>
            </div>
        `}createDepartmentFilter(){if(!this.filterService)return"";const e=this.filterService.getFilterOptions("department",this.allCourses),r=this.filterService.getActiveFilters().find(i=>i.id==="department")?.criteria?.departments||[];return`
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Departments</h4>
                    <div class="filter-section-actions">
                        <button class="filter-select-all" data-filter="department">All</button>
                        <button class="filter-select-none" data-filter="department">None</button>
                    </div>
                </div>
                <div class="filter-section-content">
                    <div class="filter-search-container">
                        <input type="text" class="filter-search" placeholder="Search departments..." data-filter="department">
                    </div>
                    <div class="filter-checkbox-grid" id="department-checkboxes">
                        ${e.map(i=>`
            <label class="filter-checkbox-label">
                <input type="checkbox" value="${i}" ${r.includes(i)?"checked":""} 
                       data-filter="department">
                <span class="filter-checkbox-text">${i}</span>
            </label>
        `).join("")}
                    </div>
                </div>
            </div>
        `}createAvailabilityFilter(){return this.filterService?`
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Availability</h4>
                </div>
                <div class="filter-section-content">
                    <label class="filter-toggle-label">
                        <input type="checkbox" class="filter-toggle" data-filter="availability" ${this.filterService.getActiveFilters().find(r=>r.id==="availability")?.criteria?.availableOnly||!1?"checked":""}>
                        <span class="filter-toggle-slider"></span>
                        <span class="filter-toggle-text">Show only courses with available seats</span>
                    </label>
                </div>
            </div>
        `:""}createCreditRangeFilter(){if(!this.filterService)return"";const e=this.filterService.getActiveFilters().find(s=>s.id==="creditRange"),t=e?.criteria?.min||1,r=e?.criteria?.max||4;return`
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Credit Hours</h4>
                </div>
                <div class="filter-section-content">
                    <div class="filter-range-container">
                        <div class="filter-range-inputs">
                            <div class="filter-range-input">
                                <label>Min Credits</label>
                                <input type="number" min="1" max="4" value="${t}" 
                                       id="credit-min" data-filter="creditRange">
                            </div>
                            <div class="filter-range-input">
                                <label>Max Credits</label>
                                <input type="number" min="1" max="4" value="${r}" 
                                       id="credit-max" data-filter="creditRange">
                            </div>
                        </div>
                        <div class="filter-quick-select">
                            <button class="filter-quick-btn" data-credits="1">1</button>
                            <button class="filter-quick-btn" data-credits="2">2</button>
                            <button class="filter-quick-btn" data-credits="3">3</button>
                            <button class="filter-quick-btn" data-credits="4">4</button>
                            <button class="filter-quick-btn" data-credits="3-4">3-4</button>
                        </div>
                    </div>
                </div>
            </div>
        `}createProfessorFilter(){return this.filterService?(this.filterService.getFilterOptions("professor",this.allCourses),`
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Professors</h4>
                </div>
                <div class="filter-section-content">
                    <div class="filter-search-container">
                        <input type="text" class="filter-search professor-search" 
                               placeholder="Search professors..." data-filter="professor">
                        <div class="professor-dropdown" id="professor-dropdown" style="display: none;"></div>
                    </div>
                    <div class="filter-selected-chips">
                        ${(this.filterService.getActiveFilters().find(s=>s.id==="professor")?.criteria?.professors||[]).map(s=>`
            <span class="filter-chip">
                ${this.escapeHtml(s)}
                <button class="filter-chip-remove" data-professor="${this.escapeHtml(s)}">×</button>
            </span>
        `).join("")}
                    </div>
                </div>
            </div>
        `):""}createTermFilter(){if(!this.filterService)return"";const e=this.filterService.getFilterOptions("term",this.allCourses),r=this.filterService.getActiveFilters().find(i=>i.id==="term")?.criteria?.terms||[];return`
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Terms</h4>
                    <button class="filter-select-all" data-filter="term">All Terms</button>
                </div>
                <div class="filter-section-content">
                    <div class="filter-checkbox-row">
                        ${e.map(i=>`
            <label class="filter-checkbox-label term-checkbox">
                <input type="checkbox" value="${i}" ${r.includes(i)?"checked":""} 
                       data-filter="term">
                <span class="filter-checkbox-text">${i} Term</span>
            </label>
        `).join("")}
                    </div>
                </div>
            </div>
        `}createLocationFilter(){if(!this.filterService)return"";const t=this.filterService.getFilterOptions("location",this.allCourses).buildings||[],s=this.filterService.getActiveFilters().find(o=>o.id==="location")?.criteria?.buildings||[];return`
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Buildings</h4>
                    <div class="filter-section-actions">
                        <button class="filter-select-all" data-filter="location">All</button>
                        <button class="filter-select-none" data-filter="location">None</button>
                    </div>
                </div>
                <div class="filter-section-content">
                    <div class="filter-search-container">
                        <input type="text" class="filter-search" placeholder="Search buildings..." data-filter="location">
                    </div>
                    <div class="filter-checkbox-grid" id="location-checkboxes">
                        ${t.map(o=>`
            <label class="filter-checkbox-label">
                <input type="checkbox" value="${o}" ${s.includes(o)?"checked":""} 
                       data-filter="location">
                <span class="filter-checkbox-text">${o}</span>
            </label>
        `).join("")}
                    </div>
                </div>
            </div>
        `}initializeFilterUI(e){this.filterService&&(this.setupSearchTextFilter(e),this.setupDepartmentFilter(e),this.setupAvailabilityFilter(e),this.setupCreditRangeFilter(e),this.setupProfessorFilter(e),this.setupTermFilter(e),this.setupLocationFilter(e),this.setupClearAllButton(e),this.setupFilterSearch(e))}setupSearchTextFilter(e){const t=e.querySelector(".search-text-input"),r=e.querySelector(".filter-clear-search");t&&t.addEventListener("input",()=>{const s=t.value.trim();this.updateSearchTextFilter(s,e),this.syncMainSearchInput(s)}),r&&r.addEventListener("click",()=>{t&&(t.value=""),this.updateSearchTextFilter("",e),this.syncMainSearchInput("")})}setupDepartmentFilter(e){const t=e.querySelectorAll('input[data-filter="department"]');t.forEach(i=>{i.addEventListener("change",()=>this.updateDepartmentFilter(e))});const r=e.querySelector('.filter-select-all[data-filter="department"]'),s=e.querySelector('.filter-select-none[data-filter="department"]');r?.addEventListener("click",()=>{t.forEach(i=>i.checked=!0),this.updateDepartmentFilter(e)}),s?.addEventListener("click",()=>{t.forEach(i=>i.checked=!1),this.updateDepartmentFilter(e)})}setupAvailabilityFilter(e){e.querySelector('input[data-filter="availability"]')?.addEventListener("change",()=>this.updateAvailabilityFilter(e))}setupCreditRangeFilter(e){const t=e.querySelector("#credit-min"),r=e.querySelector("#credit-max"),s=e.querySelectorAll(".filter-quick-btn");t?.addEventListener("change",()=>this.updateCreditRangeFilter(e)),r?.addEventListener("change",()=>this.updateCreditRangeFilter(e)),s.forEach(i=>{i.addEventListener("click",o=>{const n=o.target.dataset.credits;if(n?.includes("-")){const[a,c]=n.split("-");t&&(t.value=a),r&&(r.value=c)}else t&&(t.value=n),r&&(r.value=n);this.updateCreditRangeFilter(e)})})}setupProfessorFilter(e){const t=e.querySelector(".professor-search"),r=e.querySelector("#professor-dropdown");if(t&&this.filterService){const i=this.filterService.getFilterOptions("professor",this.allCourses);t.addEventListener("input",()=>{const o=t.value.toLowerCase();if(o.length>0){const n=i.filter(a=>a.toLowerCase().includes(o)&&a!=="TBA").slice(0,10);r.innerHTML=n.map(a=>`<div class="professor-option" data-professor="${a}">${a}</div>`).join(""),r.style.display=n.length>0?"block":"none"}else r.style.display="none"}),document.addEventListener("click",o=>{!t.contains(o.target)&&!r.contains(o.target)&&(r.style.display="none")}),r.addEventListener("click",o=>{const n=o.target;if(n.classList.contains("professor-option")){const a=n.dataset.professor;this.addProfessorFilter(a,e),t.value="",r.style.display="none"}})}const s=e.querySelector(".filter-selected-chips");s&&s.addEventListener("click",i=>{const o=i.target;if(o.classList.contains("filter-chip-remove")){i.stopPropagation(),i.preventDefault();const n=this.unescapeHtml(o.dataset.professor);this.removeProfessorFilter(n,e)}})}setupTermFilter(e){const t=e.querySelectorAll('input[data-filter="term"]');t.forEach(s=>{s.addEventListener("change",()=>this.updateTermFilter(e))}),e.querySelector('.filter-select-all[data-filter="term"]')?.addEventListener("click",()=>{t.forEach(s=>s.checked=!0),this.updateTermFilter(e)})}setupLocationFilter(e){const t=e.querySelectorAll('input[data-filter="location"]');t.forEach(i=>{i.addEventListener("change",()=>this.updateLocationFilter(e))});const r=e.querySelector('.filter-select-all[data-filter="location"]'),s=e.querySelector('.filter-select-none[data-filter="location"]');r?.addEventListener("click",()=>{t.forEach(i=>i.checked=!0),this.updateLocationFilter(e)}),s?.addEventListener("click",()=>{t.forEach(i=>i.checked=!1),this.updateLocationFilter(e)})}setupClearAllButton(e){e.querySelector("#clear-all-filters")?.addEventListener("click",()=>{if(this.filterService){this.filterService.clearFilters(),this.updatePreview(e),this.syncMainSearchInput("");const r=e.querySelector(".filter-modal-body");r&&(r.innerHTML=this.createFilterSections(),this.initializeFilterUI(e))}})}setupFilterSearch(e){e.querySelectorAll(".filter-search").forEach(r=>{r.addEventListener("input",s=>{const i=s.target,o=i.dataset.filter,n=i.value.toLowerCase();if(o==="department"){const a=e.querySelector("#department-checkboxes");a&&a.querySelectorAll(".filter-checkbox-label").forEach(l=>{const h=l.textContent.toLowerCase();l.style.display=h.includes(n)?"flex":"none"})}else if(o==="location"){const a=e.querySelector("#location-checkboxes");a&&a.querySelectorAll(".filter-checkbox-label").forEach(l=>{const h=l.textContent.toLowerCase();l.style.display=h.includes(n)?"flex":"none"})}})})}updateSearchTextFilter(e,t){e.length>0?this.filterService?.addFilter("searchText",{query:e}):this.filterService?.removeFilter("searchText"),this.updatePreview(t),this.updateClearSearchButton(t,e)}syncMainSearchInput(e){const t=document.getElementById("search-input");t&&(t.value=e)}updateClearSearchButton(e,t){const r=e.querySelector(".filter-clear-search");r&&(r.style.display=t.length>0?"inline-block":"none")}updateDepartmentFilter(e){const t=e.querySelectorAll('input[data-filter="department"]:checked'),r=Array.from(t).map(s=>s.value);r.length>0?this.filterService?.addFilter("department",{departments:r}):this.filterService?.removeFilter("department"),this.updatePreview(e)}updateAvailabilityFilter(e){e.querySelector('input[data-filter="availability"]').checked?this.filterService?.addFilter("availability",{availableOnly:!0}):this.filterService?.removeFilter("availability"),this.updatePreview(e)}updateCreditRangeFilter(e){const t=e.querySelector("#credit-min"),r=e.querySelector("#credit-max"),s=parseInt(t.value),i=parseInt(r.value);s&&i&&(s!==1||i!==4)?this.filterService?.addFilter("creditRange",{min:s,max:i}):this.filterService?.removeFilter("creditRange"),this.updatePreview(e)}addProfessorFilter(e,t){if(!this.filterService)return;const s=this.filterService.getActiveFilters().find(i=>i.id==="professor")?.criteria?.professors||[];if(!s.includes(e)){const i=[...s,e];this.filterService.addFilter("professor",{professors:i}),this.refreshProfessorChips(t),this.updatePreview(t)}}removeProfessorFilter(e,t){if(!this.filterService)return;const i=(this.filterService.getActiveFilters().find(o=>o.id==="professor")?.criteria?.professors||[]).filter(o=>o!==e);i.length>0?this.filterService.addFilter("professor",{professors:i}):this.filterService.removeFilter("professor"),this.refreshProfessorChips(t),this.updatePreview(t)}refreshProfessorChips(e){if(!this.filterService)return;const r=this.filterService.getActiveFilters().find(i=>i.id==="professor")?.criteria?.professors||[],s=e.querySelector(".filter-selected-chips");s&&(s.innerHTML=r.map(i=>`
                <span class="filter-chip">
                    ${this.escapeHtml(i)}
                    <button class="filter-chip-remove" data-professor="${this.escapeHtml(i)}">×</button>
                </span>
            `).join(""))}updateTermFilter(e){const t=e.querySelectorAll('input[data-filter="term"]:checked'),r=Array.from(t).map(s=>s.value);r.length>0?this.filterService?.addFilter("term",{terms:r}):this.filterService?.removeFilter("term"),this.updatePreview(e)}updateLocationFilter(e){const t=e.querySelectorAll('input[data-filter="location"]:checked'),r=Array.from(t).map(s=>s.value);r.length>0?this.filterService?.addFilter("location",{buildings:r}):this.filterService?.removeFilter("location"),this.updatePreview(e)}updatePreview(e){if(!this.filterService)return;const r=this.filterService.filterCourses(this.allCourses).length,s=this.filterService.getFilterCount(),i=e.querySelector("#course-count-preview"),o=e.querySelector("#filter-count");i&&(i.textContent=`${r} courses match current filters`),o&&(o.textContent=s>0?`(${s})`:"")}escapeHtml(e){const t=document.createElement("div");return t.textContent=e,t.innerHTML}unescapeHtml(e){const t=document.createElement("div");return t.innerHTML=e,t.textContent||t.innerText||""}}class Le{constructor(){this.activeFilters=new Map,this.listeners=[]}addFilter(e,t,r,s){const i={id:e,name:t,criteria:r,displayValue:s};this.activeFilters.set(e,i),this.notifyListeners({type:"add",filterId:e,criteria:r,activeFilters:this.getActiveFilters()})}removeFilter(e){const t=this.activeFilters.delete(e);return t&&this.notifyListeners({type:"remove",filterId:e,activeFilters:this.getActiveFilters()}),t}updateFilter(e,t,r){const s=this.activeFilters.get(e);return s?(s.criteria=t,s.displayValue=r,this.notifyListeners({type:"update",filterId:e,criteria:t,activeFilters:this.getActiveFilters()}),!0):!1}clearFilters(){this.activeFilters.clear(),this.notifyListeners({type:"clear",activeFilters:[]})}hasFilter(e){return this.activeFilters.has(e)}getFilter(e){return this.activeFilters.get(e)}getActiveFilters(){return Array.from(this.activeFilters.values())}getFilterCriteria(){const e={};for(const[t,r]of this.activeFilters)e[t]=r.criteria;return e}getActiveFilterIds(){return Array.from(this.activeFilters.keys())}getFilterCount(){return this.activeFilters.size}isEmpty(){return this.activeFilters.size===0}addEventListener(e){this.listeners.push(e)}removeEventListener(e){const t=this.listeners.indexOf(e);t>-1&&this.listeners.splice(t,1)}notifyListeners(e){this.listeners.forEach(t=>{try{t(e)}catch(r){console.error("Error in filter event listener:",r)}})}serialize(){const e={filters:Array.from(this.activeFilters.entries()).map(([t,r])=>({id:r.id,name:r.name,criteria:r.criteria,displayValue:r.displayValue}))};return JSON.stringify(e)}deserialize(e){try{const t=JSON.parse(e);return this.activeFilters.clear(),t.filters&&Array.isArray(t.filters)&&t.filters.forEach(r=>{this.activeFilters.set(r.id,r)}),this.notifyListeners({type:"clear",activeFilters:this.getActiveFilters()}),!0}catch(t){return console.error("Failed to deserialize filter state:",t),!1}}}class Oe{constructor(e){this.registeredFilters=new Map,this.filterState=new Le,this.searchService=e}registerFilter(e){this.registeredFilters.set(e.id,e)}unregisterFilter(e){const t=this.registeredFilters.delete(e);return t&&this.removeFilter(e),t}getRegisteredFilter(e){return this.registeredFilters.get(e)}getAvailableFilters(){return Array.from(this.registeredFilters.values())}addFilter(e,t){const r=this.registeredFilters.get(e);if(!r)return console.error(`Filter '${e}' is not registered`),!1;if(!r.isValidCriteria(t))return console.error(`Invalid criteria for filter '${e}'`),!1;const s=r.getDisplayValue(t);return this.filterState.addFilter(e,r.name,t,s),!0}updateFilter(e,t){const r=this.registeredFilters.get(e);if(!r||!r.isValidCriteria(t))return!1;const s=r.getDisplayValue(t);return this.filterState.updateFilter(e,t,s)}removeFilter(e){return this.filterState.removeFilter(e)}clearFilters(){this.filterState.clearFilters()}toggleFilter(e,t){return this.hasFilter(e)?this.removeFilter(e):this.addFilter(e,t)}hasFilter(e){return this.filterState.hasFilter(e)}getActiveFilters(){return this.filterState.getActiveFilters()}getFilterCount(){return this.filterState.getFilterCount()}isEmpty(){return this.filterState.isEmpty()}filterCourses(e){if(this.isEmpty())return e;let t=e;const r=this.getActiveFilters(),s=r.find(i=>i.id==="searchText");if(s){const i=this.registeredFilters.get(s.id);i&&(t=i.apply(t,s.criteria))}for(const i of r)if(i.id!=="searchText"){const o=this.registeredFilters.get(i.id);o&&(t=o.apply(t,i.criteria))}return t}searchAndFilter(e,t){return e.trim()?this.addFilter("searchText",{query:e.trim()}):this.removeFilter("searchText"),this.filterCourses(t)}addEventListener(e){this.filterState.addEventListener(e)}removeEventListener(e){this.filterState.removeEventListener(e)}saveFiltersToStorage(){const e=this.filterState.serialize();localStorage.setItem("wpi-course-filters",e)}loadFiltersFromStorage(){const e=localStorage.getItem("wpi-course-filters");return e?this.filterState.deserialize(e):!1}getFilterSummary(){const e=this.getActiveFilters();return e.length===0?"No filters active":e.length===1?`1 filter: ${e[0].displayValue}`:`${e.length} filters active`}convertToSearchFilter(){const e=this.filterState.getFilterCriteria();return{departments:e.department?.departments||[],timeSlots:e.timeSlot?.timeSlots||[],professors:e.professor?.professors||[],availabilityOnly:e.availability?.availableOnly||!1,creditRange:e.creditRange?{min:e.creditRange.min,max:e.creditRange.max}:void 0}}getFilterOptions(e,t){switch(e){case"department":return this.getDepartmentOptions(t);case"professor":return this.getProfessorOptions(t);case"location":return this.getLocationOptions(t);case"term":return this.getTermOptions(t);default:return null}}getDepartmentOptions(e){const t=new Set;return e.forEach(r=>t.add(r.department.abbreviation)),Array.from(t).sort()}getProfessorOptions(e){return this.searchService.getAvailableProfessors()}getLocationOptions(e){return{buildings:this.searchService.getAvailableBuildings(),rooms:[]}}getTermOptions(e){const t=new Set;return e.forEach(r=>{r.sections.forEach(s=>{s.term&&t.add(s.term)})}),Array.from(t).sort()}}class Ie{constructor(){this.courses=[],this.departments=[],this.searchIndex=new Map,this.professorCache=null,this.buildingCache=null,this.timeSlotMappings=new Map}setCourseData(e){this.departments=e,this.courses=[];for(const t of e)this.courses.push(...t.courses);this.clearCaches(),this.buildSearchIndex(),this.buildTimeSlotMappings()}searchCourses(e,t){let r=this.courses;return e.trim()&&(r=this.performTextSearch(r,e.trim())),t&&(r=this.applyFilters(r,t)),this.rankResults(r,e)}performTextSearch(e,t){const r=t.toLowerCase(),s=this.searchFromIndex(r);return s.length>0?e.filter(i=>s.includes(i)):e.filter(i=>{const o=[i.id,i.name,i.description,i.department.abbreviation,i.department.name,i.number].join(" ").toLowerCase();return this.fuzzyMatch(o,r)})}applyFilters(e,t){return e.filter(r=>{if(t.departments.length>0&&!t.departments.includes(r.department.abbreviation.toLowerCase()))return!1;if(t.creditRange){const{min:s,max:i}=t.creditRange;if(r.maxCredits<s||r.minCredits>i)return!1}return!(t.availabilityOnly&&!r.sections.some(i=>i.seatsAvailable>0)||t.timeSlots.length>0&&!r.sections.some(i=>i.periods.some(o=>t.timeSlots.some(n=>this.periodsOverlap(o,n))))||t.professors.length>0&&!r.sections.some(i=>i.periods.some(o=>t.professors.some(n=>o.professor.toLowerCase().includes(n.toLowerCase())))))})}periodsOverlap(e,t){const r=e.startTime.hours*60+e.startTime.minutes,s=e.endTime.hours*60+e.endTime.minutes,i=t.startTime.hours*60+t.startTime.minutes,o=t.endTime.hours*60+t.endTime.minutes,n=r<o&&i<s,a=t.days.some(c=>e.days.has(c));return n&&a}rankResults(e,t){if(!t.trim())return e;const r=t.toLowerCase();return e.sort((s,i)=>{const o=this.calculateRelevanceScore(s,r);return this.calculateRelevanceScore(i,r)-o})}calculateRelevanceScore(e,t){let r=0;e.id.toLowerCase()===t&&(r+=100),e.name.toLowerCase()===t&&(r+=90),e.id.toLowerCase().startsWith(t)&&(r+=80),e.name.toLowerCase().startsWith(t)&&(r+=70),e.department.abbreviation.toLowerCase().startsWith(t)&&(r+=60),e.id.toLowerCase().includes(t)&&(r+=40),e.name.toLowerCase().includes(t)&&(r+=30),e.description.toLowerCase().includes(t)&&(r+=10);const s=e.sections.reduce((o,n)=>o+n.seats,0);return e.sections.reduce((o,n)=>o+n.seatsAvailable,0)>0&&(r+=5),s>100&&(r+=2),r}getDepartments(){return this.departments}getCoursesByDepartment(e){const t=this.departments.find(r=>r.abbreviation.toLowerCase()===e.toLowerCase());return t?t.courses:[]}getAvailableProfessors(){if(this.professorCache)return this.professorCache;const e=new Set;return this.courses.forEach(t=>{t.sections.forEach(r=>{r.periods.forEach(s=>{s.professor&&s.professor!=="TBA"&&e.add(s.professor)})})}),this.professorCache=Array.from(e).sort(),this.professorCache}getAvailableBuildings(){if(this.buildingCache)return this.buildingCache;const e=new Set;return this.courses.forEach(t=>{t.sections.forEach(r=>{r.periods.forEach(s=>{s.building&&e.add(s.building)})})}),this.buildingCache=Array.from(e).sort(),this.buildingCache}clearCaches(){this.professorCache=null,this.buildingCache=null,this.searchIndex.clear(),this.timeSlotMappings.clear()}buildSearchIndex(){this.courses.forEach(e=>{this.extractKeywords(e).forEach(r=>{this.searchIndex.has(r)||this.searchIndex.set(r,new Set),this.searchIndex.get(r).add(e)})})}extractKeywords(e){const t=[e.id.toLowerCase(),e.name.toLowerCase(),e.number.toLowerCase(),e.department.abbreviation.toLowerCase(),e.department.name.toLowerCase(),...e.description.toLowerCase().split(/\s+/)];return t.forEach(r=>{if(r.length>3)for(let s=0;s<r.length-2;s++)t.push(r.substring(s,s+3))}),t.filter(r=>r.length>1)}searchFromIndex(e){const t=new Set;this.searchIndex.has(e)&&this.searchIndex.get(e).forEach(r=>t.add(r));for(const[r,s]of this.searchIndex.entries())(r.includes(e)||e.includes(r))&&s.forEach(i=>t.add(i));return Array.from(t)}fuzzyMatch(e,t){return e.includes(t)?!0:t.length<=3?e.includes(t):t.split(/\s+/).every(s=>{if(s.length<=2)return e.includes(s);const i=s.substring(0,Math.floor(s.length*.8));return e.includes(i)})}buildTimeSlotMappings(){this.courses.forEach(e=>{e.sections.forEach(t=>{t.periods.forEach(r=>{const s=this.getTimeSlotKey(r);this.timeSlotMappings.has(s)||this.timeSlotMappings.set(s,[]),this.timeSlotMappings.get(s).includes(e)||this.timeSlotMappings.get(s).push(e)})})})}getTimeSlotKey(e){const t=e.startTime.hours*60+e.startTime.minutes,r=e.endTime.hours*60+e.endTime.minutes;return`${Array.from(e.days).sort().join("")}-${t}-${r}`}getCreditRanges(){return[{min:1,max:1,label:"1 Credit"},{min:2,max:2,label:"2 Credits"},{min:3,max:3,label:"3 Credits"},{min:4,max:4,label:"4 Credits"},{min:1,max:2,label:"1-2 Credits"},{min:3,max:4,label:"3-4 Credits"},{min:1,max:4,label:"Any Credits"}]}}class ke{constructor(){this.id="department",this.name="Department",this.description="Filter courses by department(s)"}apply(e,t){if(!t.departments||t.departments.length===0)return e;const r=new Set(t.departments.map(s=>s.toLowerCase()));return e.filter(s=>r.has(s.department.abbreviation.toLowerCase()))}isValidCriteria(e){return e&&Array.isArray(e.departments)&&e.departments.every(t=>typeof t=="string")}getDisplayValue(e){return e.departments.length===1?`Department: ${e.departments[0]}`:`Departments: ${e.departments.join(", ")}`}}class Re{constructor(){this.id="availability",this.name="Availability",this.description="Show only courses with available seats"}apply(e,t){return t.availableOnly?e.filter(r=>r.sections.some(s=>s.seatsAvailable>0)):e}isValidCriteria(e){return e&&typeof e.availableOnly=="boolean"}getDisplayValue(e){return e.availableOnly?"Available seats only":"All courses"}}class Be{constructor(){this.id="creditRange",this.name="Credit Range",this.description="Filter courses by credit hours"}apply(e,t){return e.filter(r=>r.maxCredits>=t.min&&r.minCredits<=t.max)}isValidCriteria(e){return e&&typeof e.min=="number"&&typeof e.max=="number"&&e.min>=0&&e.max>=e.min}getDisplayValue(e){return e.min===e.max?`${e.min} credit${e.min===1?"":"s"}`:`${e.min}-${e.max} credits`}}class Pe{constructor(){this.id="professor",this.name="Professor",this.description="Filter courses by instructor"}apply(e,t){if(!t.professors||t.professors.length===0)return e;const r=new Set(t.professors.map(s=>s.toLowerCase()));return e.filter(s=>s.sections.some(i=>i.periods.some(o=>r.has(o.professor.toLowerCase()))))}isValidCriteria(e){return e&&Array.isArray(e.professors)&&e.professors.every(t=>typeof t=="string")}getDisplayValue(e){return e.professors.length===1?`Professor: ${e.professors[0]}`:e.professors.length<=3?`Professors: ${e.professors.join(", ")}`:`Professors: ${e.professors.slice(0,2).join(", ")}, +${e.professors.length-2} more`}}class He{constructor(){this.id="term",this.name="Term",this.description="Filter courses by academic term"}apply(e,t){if(!t.terms||t.terms.length===0)return e;const r=new Set(t.terms.map(s=>s.toLowerCase()));return e.filter(s=>s.sections.some(i=>i.term&&r.has(i.term.toLowerCase())))}isValidCriteria(e){return e&&Array.isArray(e.terms)&&e.terms.every(t=>typeof t=="string")}getDisplayValue(e){return e.terms.length===1?`Term: ${e.terms[0]}`:`Terms: ${e.terms.join(", ")}`}}class Ne{constructor(){this.id="location",this.name="Location",this.description="Filter courses by building or room"}apply(e,t){const r=t.buildings&&t.buildings.length>0,s=t.rooms&&t.rooms.length>0;if(!r&&!s)return e;const i=r?new Set(t.buildings.map(n=>n.toLowerCase())):null,o=s?new Set(t.rooms.map(n=>n.toLowerCase())):null;return e.filter(n=>n.sections.some(a=>a.periods.some(c=>!(i&&!i.has(c.building.toLowerCase())||o&&!o.has(c.room.toLowerCase())))))}isValidCriteria(e){return e&&(Array.isArray(e.buildings)||Array.isArray(e.rooms))&&(!e.buildings||e.buildings.every(t=>typeof t=="string"))&&(!e.rooms||e.rooms.every(t=>typeof t=="string"))}getDisplayValue(e){const t=[];return e.buildings&&e.buildings.length>0&&(e.buildings.length===1?t.push(`Building: ${e.buildings[0]}`):t.push(`Buildings: ${e.buildings.join(", ")}`)),e.rooms&&e.rooms.length>0&&(e.rooms.length===1?t.push(`Room: ${e.rooms[0]}`):t.push(`Rooms: ${e.rooms.join(", ")}`)),t.join("; ")}}class Ue{constructor(){this.id="searchText",this.name="Search Text",this.description="Filter courses by search text"}apply(e,t){if(!t.query||!t.query.trim())return e;const r=t.query.trim().toLowerCase();return e.filter(s=>{const i=[s.id,s.name,s.description,s.department.abbreviation,s.department.name,s.number].join(" ").toLowerCase();return i.includes(r)||this.fuzzyMatch(i,r)})}fuzzyMatch(e,t){return t.length<=3?e.includes(t):t.split(/\s+/).every(s=>{if(s.length<=2)return e.includes(s);const i=s.substring(0,Math.floor(s.length*.8));return e.includes(i)})}isValidCriteria(e){return e&&typeof e=="object"&&"query"in e&&typeof e.query=="string"}getDisplayValue(e){return`"${e.query.trim()}"`}}const ze=()=>[new ke,new Re,new Be,new Pe,new He,new Ne];class qe{constructor(){this.currentView="list",this.currentPage="planner"}setView(e){this.currentView=e;const t=document.getElementById("view-list"),r=document.getElementById("view-grid");t&&r&&(e==="list"?(t.classList.add("btn-primary","active"),t.classList.remove("btn-secondary"),r.classList.add("btn-secondary"),r.classList.remove("btn-primary","active")):(r.classList.add("btn-primary","active"),r.classList.remove("btn-secondary"),t.classList.add("btn-secondary"),t.classList.remove("btn-primary","active")))}togglePage(){const e=this.currentPage==="planner"?"schedule":"planner";this.switchToPage(e)}switchToPage(e){if(e===this.currentPage)return;this.currentPage=e;const t=document.getElementById("schedule-btn");t&&(e==="schedule"?(t.textContent="Back to Classes",this.showSchedulePage()):(t.textContent="Schedule",this.showPlannerPage()))}showPlannerPage(){const e=document.getElementById("planner-page"),t=document.getElementById("schedule-page");e&&(e.style.display="grid"),t&&(t.style.display="none")}showSchedulePage(){const e=document.getElementById("planner-page"),t=document.getElementById("schedule-page");e&&(e.style.display="none"),t&&(t.style.display="flex")}showLoadingState(){const e=document.getElementById("department-list");e&&(e.innerHTML='<div class="loading-message">Loading departments...</div>')}showErrorMessage(e){const t=document.getElementById("department-list");t&&(t.innerHTML=`<div class="error-message">${e}</div>`);const r=document.getElementById("course-container");r&&(r.innerHTML=`<div class="error-message">${e}</div>`)}syncHeaderHeights(){const e=document.querySelector(".sidebar-header"),t=document.querySelector(".content-header"),r=document.querySelectorAll(".panel-header");!e||!t||!r.length||(document.documentElement.style.setProperty("--synced-header-height","auto"),requestAnimationFrame(()=>{const s=e.offsetHeight,i=t.offsetHeight,o=Array.from(r).map(a=>a.offsetHeight),n=Math.max(s,i,...o);document.documentElement.style.setProperty("--synced-header-height",`${n}px`)}))}setupHeaderResizeObserver(){if(!window.ResizeObserver)return;const e=[document.querySelector(".sidebar-header"),document.querySelector(".content-header"),...document.querySelectorAll(".panel-header")].filter(Boolean);if(!e.length)return;const t=new ResizeObserver(()=>{this.syncHeaderHeights()});e.forEach(r=>{t.observe(r)})}}class Ve{constructor(){}updateClientTimestamp(){const e=document.getElementById("client-timestamp");if(e){const t=new Date,r={month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",second:"2-digit",hour12:!0},s=t.toLocaleDateString("en-US",r).replace(","," at");e.textContent=`Client loaded: ${s}`}}async loadServerTimestamp(){const e=document.getElementById("server-timestamp");if(e)try{const t=await fetch("./last-updated.json",{cache:"no-cache"});if(t.ok){const r=await t.json(),s=new Date(r.timestamp),i={month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",second:"2-digit",hour12:!0},o=s.toLocaleDateString("en-US",i).replace(","," at");e.textContent=`Server updated: ${o}`}else throw new Error(`Failed to fetch server timestamp: ${t.status}`)}catch(t){console.warn("Failed to load server timestamp:",t),e.textContent="Server timestamp unavailable"}}}class Ye{constructor(e,t){this.filterModalController=null,this.listeners=[],this.isUpdating=!1,this.filterService=e,this.departmentController=t,this.filterService.addEventListener(()=>{this.isUpdating||(this.syncFilterToSidebar(),this.syncFilterToModal(),this.notifyListeners())})}setFilterModalController(e){this.filterModalController=e}addEventListener(e){this.listeners.push(e)}removeEventListener(e){const t=this.listeners.indexOf(e);t>-1&&this.listeners.splice(t,1)}notifyListeners(){const e=this.getActiveDepartments();this.listeners.forEach(t=>t(e))}syncSidebarToFilter(e,t=!1){this.isUpdating=!0;try{const r=this.getActiveDepartments();let s;t?r.includes(e)?s=r.filter(i=>i!==e):s=[...r,e]:r.length===1&&r[0]===e?s=[]:s=[e],s.length>0?this.filterService.addFilter("department",{departments:s}):this.filterService.removeFilter("department"),this.departmentController.clearDepartmentSelection(),this.updateSidebarVisualState(s),this.syncFilterToModal()}finally{this.isUpdating=!1}}syncFilterToSidebar(){if(this.isUpdating)return;const e=this.getActiveDepartments();this.updateSidebarVisualState(e),this.departmentController.clearDepartmentSelection()}syncFilterToModal(){!this.filterModalController||this.isUpdating||(this.filterModalController.refreshDepartmentSelection(),setTimeout(()=>{const e=this.getActiveDepartments();this.updateSidebarVisualState(e)},50))}getActiveDepartments(){return this.filterService.getActiveFilters().find(r=>r.id==="department")?.criteria?.departments||[]}clearAllDepartmentSelections(){this.isUpdating=!0;try{this.filterService.removeFilter("department"),this.departmentController.clearDepartmentSelection(),this.updateSidebarVisualState([]),this.syncFilterToModal()}finally{this.isUpdating=!1}}isDepartmentSelected(e){return this.getActiveDepartments().includes(e)}getSelectedDepartmentCount(){return this.getActiveDepartments().length}toggleDepartment(e){this.getActiveDepartments().includes(e)?this.syncSidebarToFilter(e,!0):this.syncSidebarToFilter(e,!0)}selectDepartments(e){this.isUpdating=!0;try{e.length>0?this.filterService.addFilter("department",{departments:e}):this.filterService.removeFilter("department"),this.updateSidebarVisualState(e),this.syncFilterToModal()}finally{this.isUpdating=!1}}updateSidebarVisualState(e){console.log("🔄 Updating sidebar visual state for departments:",e);const t=document.querySelectorAll(".department-item");console.log(`📊 Found ${t.length} department items in DOM`),t.forEach((s,i)=>{const o=s.getAttribute("data-dept-id");s.classList.contains("active")&&console.log(`🔄 Removing active class from ${o||`item-${i}`}`),s.classList.remove("active")});let r=0;e.forEach(s=>{const i=this.normalizeDepartmentId(s),o=this.findDepartmentElement(i);o?(o.classList.add("active"),r++,console.log(`✅ Applied active styling to ${s} (normalized: ${i})`)):(console.warn(`❌ Could not find department element for ${s} (normalized: ${i})`),this.debugDepartmentElementSearch(s))}),console.log(`📈 Successfully applied active styling to ${r}/${e.length} departments`),this.updateMultiSelectionIndicators(e)}normalizeDepartmentId(e){return e.trim().toUpperCase()}findDepartmentElement(e){const t=this.normalizeDepartmentId(e);let r=document.querySelector(`[data-dept-id="${e}"]`);if(r||(r=document.querySelector(`[data-dept-id="${t}"]`),r)||(r=document.querySelector(`[data-dept-id="${t.toLowerCase()}"]`),r))return r;const s=document.querySelectorAll(".department-item");for(const i of s){const o=i.getAttribute("data-dept-id");if(o&&o.toUpperCase()===t)return i}return null}debugDepartmentElementSearch(e){const t=document.querySelectorAll(".department-item");console.log(`🔍 Debug search for ${e}:`),console.log("   Available department items:"),t.forEach((s,i)=>{const o=s.getAttribute("data-dept-id"),n=s.textContent?.trim()||"No text";console.log(`   ${i+1}. data-dept-id="${o}" text="${n}"`)}),document.getElementById("department-list")?console.log("✅ Department list container exists"):console.error("❌ Department list container (#department-list) not found in DOM!")}updateMultiSelectionIndicators(e){const t=document.querySelector(".sidebar-header h2");t&&(e.length===0?t.textContent="Departments":e.length===1?t.textContent="Departments (1 selected)":t.textContent=`Departments (${e.length} selected)`);const r=document.getElementById("department-list");r&&(e.length>1?r.classList.add("multi-select-active"):r.classList.remove("multi-select-active"))}initialize(){this.syncFilterToSidebar();const e=this.getActiveDepartments();e.length>0&&this.updateSidebarVisualState(e)}getSelectionDescription(){const e=this.getActiveDepartments();return e.length===0?"No departments selected":e.length===1?`${e[0]} selected`:e.length<=3?`${e.join(", ")} selected`:`${e.length} departments selected`}forceVisualRefresh(){console.log("🔄 Forcing complete visual refresh of department states");const e=this.getActiveDepartments();this.updateSidebarVisualState(e)}debugVisualSync(){const e=this.getActiveDepartments(),t=[];document.querySelectorAll(".department-item.active").forEach(i=>{const o=i.getAttribute("data-dept-id");o&&t.push(o)}),console.log("🔍 Department Sync Debug:"),console.log("  Filter state departments:",e),console.log("  Visually active departments:",t);const r=e.filter(i=>!t.includes(i)),s=t.filter(i=>!e.includes(i));r.length>0&&console.warn("  ❌ Departments missing visual active state:",r),s.length>0&&console.warn("  ❌ Departments with incorrect visual active state:",s),r.length===0&&s.length===0&&console.log("  ✅ Visual state perfectly synced with filter state")}enableDebugMode(){console.log("🐛 Enabling department selection debug mode"),this.getActiveDepartments().forEach(t=>{const r=this.findDepartmentElement(t);r&&r.classList.add("debug-selected")}),setTimeout(()=>{this.disableDebugMode()},1e4)}disableDebugMode(){console.log("🐛 Disabling department selection debug mode"),document.querySelectorAll(".department-item.debug-selected").forEach(e=>{e.classList.remove("debug-selected")})}}class je{constructor(){this.allDepartments=[],this.previousSelectedCoursesCount=0,this.previousSelectedCoursesMap=new Map,this.courseDataService=new k,this.themeSelector=new fe,this.courseSelectionService=new ge,this.conflictDetector=new ve,this.modalService=new Se,this.departmentController=new ye,this.searchService=new Ie,this.filterService=new Oe(this.searchService),this.courseController=new $e(this.courseSelectionService),this.scheduleController=new Ae(this.courseSelectionService),this.sectionInfoModalController=new Fe(this.modalService),this.infoModalController=new Me(this.modalService),this.filterModalController=new De(this.modalService),this.initializeFilters(),this.courseController.setFilterService(this.filterService),this.filterModalController.setFilterService(this.filterService),this.scheduleController.setSectionInfoModalController(this.sectionInfoModalController),this.uiStateManager=new qe,this.timestampManager=new Ve,this.operationManager=new we,this.debouncedSearch=new Te(this.operationManager,"search",300),this.departmentSyncService=new Ye(this.filterService,this.departmentController),this.departmentController.setDepartmentSyncService(this.departmentSyncService),this.departmentSyncService.setFilterModalController(this.filterModalController),this.scheduleController.setStatePreserver({preserve:()=>this.preserveDropdownStates(),restore:t=>this.restoreDropdownStates(t)});const e=this.courseSelectionService.getSelectedCourses();this.previousSelectedCoursesCount=e.length,this.previousSelectedCoursesMap=new Map,e.forEach(t=>{this.previousSelectedCoursesMap.set(t.course.id,t.selectedSectionNumber)}),this.init()}initializeFilters(){ze().forEach(r=>{this.filterService.registerFilter(r)});const t=new Ue;this.filterService.registerFilter(t),this.filterService.addEventListener(r=>{this.refreshCurrentView()}),this.filterService.loadFiltersFromStorage(),setTimeout(()=>this.updateFilterButtonState(),100)}async init(){this.uiStateManager.showLoadingState(),await this.loadCourseData(),this.departmentController.displayDepartments(),this.setupEventListeners(),this.setupCourseSelectionListener(),this.courseController.displaySelectedCourses(),this.uiStateManager.syncHeaderHeights(),this.uiStateManager.setupHeaderResizeObserver()}async loadCourseData(){try{console.log("Loading course data...");const e=await this.courseDataService.loadCourseData();this.allDepartments=e.departments,this.departmentController.setAllDepartments(this.allDepartments),this.courseController.setAllDepartments(this.allDepartments),this.courseSelectionService.setAllDepartments(this.allDepartments),this.searchService.setCourseData(this.allDepartments),this.filterModalController.setCourseData(this.allDepartments),this.departmentSyncService.initialize(),console.log(`Loaded ${this.allDepartments.length} departments`),console.log("Reconstructing section objects for persisted selections..."),this.courseSelectionService.reconstructSectionObjects(),this.timestampManager.updateClientTimestamp(),this.timestampManager.loadServerTimestamp(),typeof window<"u"&&(window.debugDepartmentSync={debug:()=>this.departmentSyncService.debugVisualSync(),refresh:()=>this.departmentSyncService.forceVisualRefresh(),enableDebug:()=>this.departmentSyncService.enableDebugMode(),disableDebug:()=>this.departmentSyncService.disableDebugMode(),getActive:()=>this.departmentSyncService.getActiveDepartments(),getDescription:()=>this.departmentSyncService.getSelectionDescription()},console.log("🛠️ Debug methods available: window.debugDepartmentSync.*"))}catch(e){console.error("Failed to load course data:",e),this.uiStateManager.showErrorMessage("Failed to load course data. Please try refreshing the page.")}}setupEventListeners(){document.addEventListener("click",n=>{const a=n.target;if(a.classList.contains("department-item")){const c=a.dataset.deptId;if(c){const l=n.ctrlKey||n.metaKey;this.departmentController.handleDepartmentClick(c,l)}}if(a.classList.contains("section-badge")&&a.classList.toggle("selected"),a.classList.contains("course-select-btn")){const c=a.closest(".course-item, .course-card");c&&this.courseController.toggleCourseSelection(c)}if(a.classList.contains("course-remove-btn")){const c=this.courseController.getCourseFromElement(a);c&&this.courseSelectionService.unselectCourse(c)}if(a.classList.contains("section-select-btn")){n.stopPropagation();const c=a.closest(".schedule-course-item"),l=a.dataset.section;if(c&&l){const h=this.scheduleController.getCourseFromElement(c);h&&this.scheduleController.handleSectionSelection(h,l)}return}if(a.classList.contains("section-option")||a.closest(".section-option")||a.classList.contains("section-info")||a.closest(".section-info")||a.classList.contains("section-number")||a.classList.contains("section-schedule")||a.classList.contains("section-professor")){n.stopPropagation(),n.preventDefault();return}if(a.classList.contains("dropdown-trigger")||a.closest(".dropdown-trigger")){const c=a.classList.contains("dropdown-trigger")?a:a.closest(".dropdown-trigger");c&&!a.classList.contains("course-remove-btn")&&!a.classList.contains("section-select-btn")&&!a.classList.contains("section-number")&&!a.classList.contains("section-schedule")&&!a.classList.contains("section-professor")&&!a.closest(".section-option")&&!a.closest(".section-info")&&!a.closest(".schedule-sections-container")&&this.toggleCourseDropdown(c)}if(a.closest(".course-item, .course-card")&&!a.classList.contains("course-select-btn")&&!a.classList.contains("section-badge")){const c=a.closest(".course-item, .course-card");c&&this.courseController.selectCourse(c)}});const e=document.getElementById("search-input");e&&e.addEventListener("input",()=>{const n=e.value.trim();this.debouncedSearch.execute(async a=>(a.throwIfCancelled(),n.length>0?this.filterService.addFilter("searchText",{query:n}):this.filterService.removeFilter("searchText"),a.throwIfCancelled(),this.syncModalSearchInput(n),Promise.resolve())).catch(a=>{a.name!=="CancellationError"&&console.error("Search error:",a)})});const t=document.getElementById("clear-selection");t&&t.addEventListener("click",()=>{this.clearSelection()});const r=document.getElementById("schedule-btn");r&&r.addEventListener("click",()=>{if(this.uiStateManager.togglePage(),this.uiStateManager.currentPage==="schedule"){const n=this.courseSelectionService.getSelectedCourses();console.log("=== SCHEDULE PAGE LOADED ==="),console.log(`Found ${n.length} selected courses with sections:`),n.forEach(a=>{const c=a.selectedSection!==null;console.log(`${a.course.department.abbreviation}${a.course.number}: section ${a.selectedSectionNumber} ${c?"✓":"✗"}`),c&&a.selectedSection&&(console.log(`  Term: ${a.selectedSection.term}, Periods: ${a.selectedSection.periods.length}`),console.log("  Full section object:",a.selectedSection),a.selectedSection.periods.forEach((l,h)=>{console.log(`    Period ${h+1}:`,{type:l.type,professor:l.professor,startTime:l.startTime,endTime:l.endTime,days:Array.from(l.days),location:l.location,building:l.building,room:l.room});const v=Math.floor((l.startTime.hours*60+l.startTime.minutes-7*60)/10),f=Math.floor((l.endTime.hours*60+l.endTime.minutes-7*60)/10),m=f-v;console.log(`      Time slots: ${v} to ${f} (span ${m} rows)`)}))}),console.log(`=== END SCHEDULE SECTION DATA ===
`),this.scheduleController.displayScheduleSelectedCourses(),this.scheduleController.renderScheduleGrids()}});const s=document.getElementById("view-list"),i=document.getElementById("view-grid");s&&s.addEventListener("click",()=>{this.uiStateManager.setView("list"),this.refreshCurrentView()}),i&&i.addEventListener("click",()=>{this.uiStateManager.setView("grid"),this.refreshCurrentView()});const o=document.getElementById("filter-btn");o&&o.addEventListener("click",()=>{this.filterModalController.show()})}refreshCurrentView(){const e=this.departmentController.getSelectedDepartment(),t=!this.filterService.isEmpty(),r=this.operationManager.startOperation("render","New render requested");let s=[];if(t){const i=e?e.courses:this.getAllCourses();s=this.filterService.filterCourses(i),this.updateFilteredHeader(s.length,e)}else e?(s=e.courses,this.updateDepartmentHeader(e)):(s=[],this.updateDefaultHeader());this.displayCoursesWithCancellation(s,r),t&&this.filterService.saveFiltersToStorage(),this.updateFilterButtonState(),this.syncSearchInputFromFilters()}async displayCoursesWithCancellation(e,t){try{await this.courseController.displayCoursesWithCancellation(e,this.uiStateManager.currentView,t),this.operationManager.completeOperation("render")}catch(r){if(r.name==="CancellationError")return;console.error("Error displaying courses:",r),this.operationManager.completeOperation("render")}}updateFilterButtonState(){const e=document.getElementById("filter-btn");if(e&&this.filterService){const t=!this.filterService.isEmpty(),r=this.filterService.getFilterCount();t?(e.classList.add("active"),e.title=`${r} filter${r===1?"":"s"} active - Click to modify`):(e.classList.remove("active"),e.title="Filter courses")}}clearSelection(){document.querySelectorAll(".section-badge.selected").forEach(s=>{s.classList.remove("selected")});const e=document.getElementById("search-input");e&&(e.value="");const t=document.getElementById("course-container");t&&(t.innerHTML='<div class="loading-message">Select a department to view courses...</div>');const r=document.querySelector(".content-header h2");r&&(r.textContent="Course Listings"),this.departmentController.clearDepartmentSelection(),this.courseController.clearCourseSelection(),this.courseController.displaySelectedCourses()}setupCourseSelectionListener(){this.courseSelectionService.onSelectionChange(e=>{const t=e.length,r=t!==this.previousSelectedCoursesCount,s=new Map;if(e.forEach(i=>{s.set(i.course.id,i.selectedSectionNumber)}),this.courseController.refreshCourseSelectionUI(),this.courseController.displaySelectedCourses(),r)this.scheduleController.displayScheduleSelectedCourses();else{let i=!1;for(const[o,n]of s)if(this.previousSelectedCoursesMap.get(o)!==n){i=!0;const c=e.find(l=>l.course.id===o);c&&this.scheduleController.updateSectionButtonStates(c.course,n)}i&&this.uiStateManager.currentPage==="schedule"&&this.scheduleController.renderScheduleGrids()}this.previousSelectedCoursesCount=t,this.previousSelectedCoursesMap=new Map(s)})}getSelectedCourses(){return this.courseSelectionService.getSelectedCourses()}getSelectedCoursesCount(){return this.courseSelectionService.getSelectedCoursesCount()}getCourseSelectionService(){return this.courseSelectionService}getFilterService(){return this.filterService}getModalService(){return this.modalService}getSectionInfoModalController(){return this.sectionInfoModalController}getInfoModalController(){return this.infoModalController}toggleCourseDropdown(e){const t=e.closest(".schedule-course-item");if(!t)return;t.classList.contains("collapsed")?(t.classList.remove("collapsed"),t.classList.add("expanded")):(t.classList.remove("expanded"),t.classList.add("collapsed"))}preserveDropdownStates(){const e=new Map;return document.querySelectorAll(".schedule-course-item").forEach(t=>{const r=this.scheduleController.getCourseFromElement(t);if(r){const s=t.classList.contains("expanded");e.set(r.id,s)}}),e}restoreDropdownStates(e){document.querySelectorAll(".schedule-course-item").forEach(t=>{const r=this.scheduleController.getCourseFromElement(t);r&&e.has(r.id)&&(e.get(r.id)?(t.classList.remove("collapsed"),t.classList.add("expanded")):(t.classList.remove("expanded"),t.classList.add("collapsed")))})}getAllCourses(){const e=[];return this.allDepartments.forEach(t=>{e.push(...t.courses)}),e}syncModalSearchInput(e){this.filterModalController.syncSearchInputFromMain(e)}syncSearchInputFromFilters(){const e=document.getElementById("search-input");if(e){const r=this.filterService.getActiveFilters().find(s=>s.id==="searchText")?.criteria?.query||"";e.value!==r&&(e.value=r)}}updateFilteredHeader(e,t){const r=document.querySelector(".content-header h2");if(r){const s=this.filterService.getActiveFilters(),i=s.find(o=>o.id==="searchText");if(i&&s.length===1){const o=i.criteria.query;r.textContent=`Search: "${o}" (${e} results)`}else if(i){const o=i.criteria.query,n=s.length-1;r.textContent=`Search: "${o}" + ${n} filter${n===1?"":"s"} (${e} results)`}else{const o=s.length;r.textContent=`Filtered Results: ${o} filter${o===1?"":"s"} (${e} courses)`}}}updateDepartmentHeader(e){const t=document.querySelector(".content-header h2");t&&(t.textContent=`${e.name} (${e.abbreviation})`)}updateDefaultHeader(){const e=document.querySelector(".content-header h2");e&&(e.textContent="Course Listings")}}new je;
//# sourceMappingURL=index-BCNqUZv8.js.map
