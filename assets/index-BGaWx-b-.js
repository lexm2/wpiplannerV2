(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))s(r);new MutationObserver(r=>{for(const i of r)if(i.type==="childList")for(const o of i.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&s(o)}).observe(document,{childList:!0,subtree:!0});function t(r){const i={};return r.integrity&&(i.integrity=r.integrity),r.referrerPolicy&&(i.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?i.credentials="include":r.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function s(r){if(r.ep)return;r.ep=!0;const i=t(r);fetch(r.href,i)}})();var d=(u=>(u.MONDAY="mon",u.TUESDAY="tue",u.WEDNESDAY="wed",u.THURSDAY="thu",u.FRIDAY="fri",u.SATURDAY="sat",u.SUNDAY="sun",u))(d||{});const b=class b{constructor(){this.scheduleDB=null}async loadCourseData(){try{console.log("Loading course data...");const e=await this.fetchFreshData();return this.scheduleDB=e,e}catch(e){throw console.error("Failed to load course data:",e),new Error("No course data available")}}async fetchFreshData(){console.log("Fetching course data from local static file...");const e=await fetch(b.WPI_COURSE_DATA_URL,{method:"GET",headers:{Accept:"application/json"},cache:"no-cache"});if(!e.ok)throw new Error(`Failed to fetch course data: ${e.status} ${e.statusText}`);const t=await e.json();return this.parseJSONData(t)}parseJSONData(e){if(console.log("Parsing constructed JSON data..."),!e.departments||!Array.isArray(e.departments))throw console.error("Invalid JSON data structure:",e),new Error("Invalid JSON data structure - missing departments array");console.log(`Processing ${e.departments.length} departments...`);const t={departments:this.parseConstructedDepartments(e.departments),generated:e.generated||new Date().toISOString()};return console.log(`Loaded ${t.departments.length} departments with course data`),this.logMA1024Sections(t),t}parseConstructedDepartments(e){return e.map(t=>{const s={abbreviation:t.abbreviation,name:t.name,courses:[]};return s.courses=t.courses.map(r=>({id:r.id,number:r.number,name:r.name,description:this.stripHtml(r.description||""),department:s,sections:this.parseConstructedSections(r.sections||[]),minCredits:r.min_credits||0,maxCredits:r.max_credits||0})),s})}parseConstructedSections(e){return e.map(t=>({crn:t.crn||0,number:t.number||"",seats:t.seats||0,seatsAvailable:t.seats_available||0,actualWaitlist:t.actual_waitlist||0,maxWaitlist:t.max_waitlist||0,note:t.note,description:this.stripHtml(t.description||""),term:t.term||"",periods:this.parseConstructedPeriods(t.periods||[])}))}parseConstructedPeriods(e){return e.map(t=>({type:t.type||"Lecture",professor:t.professor||"",professorEmail:void 0,startTime:this.parseConstructedTime(t.start_time),endTime:this.parseConstructedTime(t.end_time),location:t.location||"",building:t.building||"",room:t.room||"",seats:t.seats||0,seatsAvailable:t.seats_available||0,actualWaitlist:t.actual_waitlist||0,maxWaitlist:t.max_waitlist||0,days:this.parseConstructedDays(t.days||[]),specificSection:t.specific_section}))}parseConstructedTime(e){if(!e||e==="TBA")return{hours:0,minutes:0,displayTime:"TBD"};const t=e.match(/(\d{1,2}):(\d{2})/);if(!t)return{hours:0,minutes:0,displayTime:e};const s=parseInt(t[1]),r=parseInt(t[2]),i=s===0?12:s>12?s-12:s,o=s>=12?"PM":"AM",n=`${i}:${r.toString().padStart(2,"0")} ${o}`;return{hours:s,minutes:r,displayTime:n}}parseConstructedDays(e){const t=new Set;for(const s of e)switch(s.toLowerCase()){case"mon":t.add(d.MONDAY);break;case"tue":t.add(d.TUESDAY);break;case"wed":t.add(d.WEDNESDAY);break;case"thu":t.add(d.THURSDAY);break;case"fri":t.add(d.FRIDAY);break;case"sat":t.add(d.SATURDAY);break;case"sun":t.add(d.SUNDAY);break}return t}logMA1024Sections(e){const t=e.departments.find(r=>r.abbreviation==="MA");if(!t){console.log("MA department not found");return}const s=t.courses.find(r=>r.number==="1024");if(!s){console.log("MA1024 course not found");return}console.log(`
=== MA1024 SECTIONS (${s.sections.length} total) ===`),s.sections.forEach(r=>{console.log(`Section ${r.number}:`),console.log(`  Term: ${r.term}`),console.log(`  Enrollment: ${r.seatsAvailable}/${r.seats} available`),console.log(`  Periods (${r.periods.length}):`),r.periods.forEach((i,o)=>{const n=Array.from(i.days).join(", ");console.log(`    ${o+1}. ${i.type} - ${n} ${i.startTime.displayTime}-${i.endTime.displayTime} (${i.professor})`)}),console.log("")})}stripHtml(e){return e.replace(/<[^>]*>/g,"").replace(/&[^;]+;/g," ").trim()}getCachedData(){try{const e=localStorage.getItem(b.LOCAL_STORAGE_KEY);return e?JSON.parse(e).scheduleDB:null}catch(e){return console.warn("Failed to parse cached course data:",e),null}}cacheData(e){try{const t={scheduleDB:e,timestamp:Date.now()};localStorage.setItem(b.LOCAL_STORAGE_KEY,JSON.stringify(t)),console.log("Course data cached successfully")}catch(t){console.warn("Failed to cache course data:",t)}}isCacheExpired(){try{const e=localStorage.getItem(b.LOCAL_STORAGE_KEY);if(!e)return!0;const t=JSON.parse(e),s=Date.now()-t.timestamp,r=b.CACHE_EXPIRY_HOURS*60*60*1e3;return s>r}catch{return!0}}getScheduleDB(){return this.scheduleDB}searchCourses(e,t){if(!this.scheduleDB)return[];const s=[];for(const i of this.scheduleDB.departments)t&&t.length>0&&!t.includes(i.abbreviation.toLowerCase())||s.push(...i.courses);if(!e.trim())return s;const r=e.toLowerCase();return s.filter(i=>i.name.toLowerCase().includes(r)||i.number.toLowerCase().includes(r)||i.id.toLowerCase().includes(r)||i.department.abbreviation.toLowerCase().includes(r))}getAllDepartments(){return this.scheduleDB?.departments||[]}};b.WPI_COURSE_DATA_URL="./course-data-constructed.json",b.LOCAL_STORAGE_KEY="wpi-course-data",b.CACHE_EXPIRY_HOURS=1;let k=b;const R="WPI Classic",P="wpi-classic",B="Traditional WPI colors and styling",H={primary:"#ac2b37",primaryHover:"#8e2329",primaryLight:"#d4424f",secondary:"#f5f5f7",secondaryHover:"#e5e5e7",background:"#f5f5f7",backgroundAlt:"#ffffff",surface:"#ffffff",surfaceHover:"#fbfbfd",text:"#1d1d1f",textSecondary:"#86868b",textInverse:"#ffffff",border:"#e5e5e7",borderHover:"#d2d2d7",success:"#30d158",warning:"#ff9500",error:"#d32f2f",info:"#007aff"},N={fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",fontFamilyMono:"'SF Mono', Monaco, 'Cascadia Code', monospace"},U={baseUnit:"1rem",headerHeight:"64px",sidebarWidth:"280px",rightPanelWidth:"320px"},q={borderRadius:"6px",borderRadiusLarge:"8px",shadow:"0 1px 3px rgba(0,0,0,0.1)",shadowHover:"0 2px 8px rgba(172, 43, 55, 0.1)",transition:"all 0.2s ease"},Y={name:R,id:P,description:B,colors:H,typography:N,spacing:U,effects:q},V="WPI Dark",j="wpi-dark",z="Dark mode theme with WPI accent colors",G={primary:"#d4424f",primaryHover:"#ac2b37",primaryLight:"#e85a66",secondary:"#2c2c2e",secondaryHover:"#3a3a3c",background:"#1c1c1e",backgroundAlt:"#2c2c2e",surface:"#2c2c2e",surfaceHover:"#3a3a3c",text:"#ffffff",textSecondary:"#98989d",textInverse:"#1d1d1f",border:"#3a3a3c",borderHover:"#48484a",success:"#30d158",warning:"#ff9f0a",error:"#ff453a",info:"#64d2ff"},W={fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",fontFamilyMono:"'SF Mono', Monaco, 'Cascadia Code', monospace"},_={baseUnit:"1rem",headerHeight:"64px",sidebarWidth:"280px",rightPanelWidth:"320px"},K={borderRadius:"6px",borderRadiusLarge:"8px",shadow:"0 2px 8px rgba(0,0,0,0.3)",shadowHover:"0 4px 16px rgba(212, 66, 79, 0.2)",transition:"all 0.2s ease"},J={name:V,id:j,description:z,colors:G,typography:W,spacing:_,effects:K},Z="WPI Light",Q="wpi-light",X="Clean light theme with softer WPI colors",ee={primary:"#b8394a",primaryHover:"#9c2f3d",primaryLight:"#d4556b",secondary:"#f8f8fa",secondaryHover:"#ededef",background:"#ffffff",backgroundAlt:"#f8f8fa",surface:"#ffffff",surfaceHover:"#f8f8fa",text:"#2c2c2e",textSecondary:"#6d6d70",textInverse:"#ffffff",border:"#d1d1d6",borderHover:"#c7c7cc",success:"#28a745",warning:"#fd7e14",error:"#dc3545",info:"#17a2b8"},te={fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",fontFamilyMono:"'SF Mono', Monaco, 'Cascadia Code', monospace"},se={baseUnit:"1rem",headerHeight:"64px",sidebarWidth:"280px",rightPanelWidth:"320px"},re={borderRadius:"8px",borderRadiusLarge:"12px",shadow:"0 1px 4px rgba(0,0,0,0.08)",shadowHover:"0 3px 12px rgba(184, 57, 74, 0.15)",transition:"all 0.2s ease"},ie={name:Z,id:Q,description:X,colors:ee,typography:te,spacing:se,effects:re},oe="High Contrast",ne="high-contrast",ae="Accessibility-focused high contrast theme",ce={primary:"#000000",primaryHover:"#333333",primaryLight:"#666666",secondary:"#ffffff",secondaryHover:"#f0f0f0",background:"#ffffff",backgroundAlt:"#f8f8f8",surface:"#ffffff",surfaceHover:"#f0f0f0",text:"#000000",textSecondary:"#444444",textInverse:"#ffffff",border:"#000000",borderHover:"#333333",success:"#006600",warning:"#cc6600",error:"#cc0000",info:"#0066cc"},le={fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",fontFamilyMono:"'SF Mono', Monaco, 'Cascadia Code', monospace"},de={baseUnit:"1rem",headerHeight:"64px",sidebarWidth:"280px",rightPanelWidth:"320px"},ue={borderRadius:"2px",borderRadiusLarge:"4px",shadow:"0 0 0 2px #000000",shadowHover:"0 0 0 3px #000000",transition:"all 0.1s ease"},he={name:oe,id:ne,description:ae,colors:ce,typography:le,spacing:de,effects:ue};class L{constructor(){this.currentTheme="wpi-classic",this.themes=new Map,this.listeners=new Set,this.storageKey="wpi-planner-theme",this.initializeThemes(),this.loadSavedTheme()}static getInstance(){return L.instance||(L.instance=new L),L.instance}initializeThemes(){this.registerTheme(Y),this.registerTheme(J),this.registerTheme(ie),this.registerTheme(he)}loadSavedTheme(){try{const e=localStorage.getItem(this.storageKey);e&&this.themes.has(e)&&(this.currentTheme=e)}catch(e){console.warn("Failed to load saved theme preference:",e)}this.applyTheme(this.currentTheme)}registerTheme(e){if(!this.isValidTheme(e)){console.error("Invalid theme definition:",e);return}this.themes.set(e.id,e)}isValidTheme(e){return e&&typeof e.name=="string"&&typeof e.id=="string"&&typeof e.description=="string"&&e.colors&&e.typography&&e.spacing&&e.effects}getAvailableThemes(){return Array.from(this.themes.values())}getCurrentTheme(){return this.themes.get(this.currentTheme)||null}getCurrentThemeId(){return this.currentTheme}setTheme(e){if(!this.themes.has(e))return console.error(`Theme '${e}' not found`),!1;const t=this.currentTheme,s=e,r=this.themes.get(e);this.currentTheme=e,this.applyTheme(e),this.saveThemePreference(e);const i={oldTheme:t,newTheme:s,themeDefinition:r};return this.notifyListeners(i),!0}applyTheme(e){const t=this.themes.get(e);if(!t)return;const s=document.documentElement;Object.entries(t.colors).forEach(([r,i])=>{s.style.setProperty(`--color-${this.kebabCase(r)}`,i)}),Object.entries(t.typography).forEach(([r,i])=>{s.style.setProperty(`--font-${this.kebabCase(r)}`,i)}),Object.entries(t.spacing).forEach(([r,i])=>{s.style.setProperty(`--spacing-${this.kebabCase(r)}`,i)}),Object.entries(t.effects).forEach(([r,i])=>{s.style.setProperty(`--effect-${this.kebabCase(r)}`,i)}),document.body.className=document.body.className.replace(/theme-[\w-]+/g,"").trim(),document.body.classList.add(`theme-${e}`)}kebabCase(e){return e.replace(/([a-z])([A-Z])/g,"$1-$2").toLowerCase()}saveThemePreference(e){try{localStorage.setItem(this.storageKey,e)}catch(t){console.warn("Failed to save theme preference:",t)}}detectSystemPreference(){if(typeof window<"u"&&window.matchMedia){if(window.matchMedia("(prefers-color-scheme: dark)").matches)return"wpi-dark";if(window.matchMedia("(prefers-contrast: high)").matches)return"high-contrast"}return"wpi-classic"}useSystemPreference(){const e=this.detectSystemPreference();return this.setTheme(e)}onThemeChange(e){this.listeners.add(e)}offThemeChange(e){this.listeners.delete(e)}notifyListeners(e){this.listeners.forEach(t=>{try{t(e)}catch(s){console.error("Error in theme change listener:",s)}})}previewTheme(e){return this.themes.has(e)?(this.applyTheme(e),!0):!1}resetToCurrentTheme(){this.applyTheme(this.currentTheme)}exportCurrentTheme(){const e=this.getCurrentTheme();if(!e)throw new Error("No current theme to export");return JSON.stringify(e,null,2)}importTheme(e){try{const t=JSON.parse(e);return this.isValidTheme(t)?(this.registerTheme(t),!0):!1}catch(t){return console.error("Failed to import theme:",t),!1}}getThemeById(e){return this.themes.get(e)||null}hasTheme(e){return this.themes.has(e)}removeTheme(e){return["wpi-classic","wpi-dark","wpi-light","high-contrast"].includes(e)?(console.warn(`Cannot remove built-in theme: ${e}`),!1):(this.currentTheme===e&&this.setTheme("wpi-classic"),this.themes.delete(e))}}const v=class v{constructor(){this.replacer=(e,t)=>{if(t instanceof Set)return{__type:"Set",value:[...t]};if(e==="department"&&t&&t.courses)return{abbreviation:t.abbreviation,name:t.name};if(!(e==="selectedSection"&&t&&typeof t=="object"&&t.number))return t},this.reviver=(e,t)=>typeof t=="object"&&t!==null&&t.__type==="Set"?new Set(t.value):t}saveUserState(e){this.handleStorageOperation(()=>{const t=JSON.stringify(e,this.replacer);localStorage.setItem(v.STORAGE_KEYS.USER_STATE,t)},"Failed to save user state")}loadUserState(){return this.handleStorageOperation(()=>{const e=localStorage.getItem(v.STORAGE_KEYS.USER_STATE);return e?JSON.parse(e,this.reviver):null},"Failed to load user state",null)}saveSchedule(e){this.handleStorageOperation(()=>{const t=this.loadAllSchedules(),s=t.findIndex(i=>i.id===e.id);s>=0?t[s]=e:t.push(e);const r=JSON.stringify(t,this.replacer);localStorage.setItem(v.STORAGE_KEYS.SCHEDULES,r)},"Failed to save schedule")}loadSchedule(e){try{return this.loadAllSchedules().find(s=>s.id===e)||null}catch(t){return console.warn("Failed to load schedule:",t),null}}loadAllSchedules(){return this.handleStorageOperation(()=>{const e=localStorage.getItem(v.STORAGE_KEYS.SCHEDULES);return e?JSON.parse(e,this.reviver):[]},"Failed to load schedules",[])}deleteSchedule(e){try{const s=this.loadAllSchedules().filter(r=>r.id!==e);localStorage.setItem(v.STORAGE_KEYS.SCHEDULES,JSON.stringify(s))}catch(t){console.warn("Failed to delete schedule:",t)}}savePreferences(e){this.handleStorageOperation(()=>{const t=JSON.stringify(e,this.replacer);localStorage.setItem(v.STORAGE_KEYS.PREFERENCES,t)},"Failed to save preferences")}loadPreferences(){return this.handleStorageOperation(()=>{const e=localStorage.getItem(v.STORAGE_KEYS.PREFERENCES);return e?JSON.parse(e,this.reviver):this.getDefaultPreferences()},"Failed to load preferences",this.getDefaultPreferences())}getDefaultPreferences(){return{preferredTimeRange:{startTime:{hours:8,minutes:0},endTime:{hours:18,minutes:0}},preferredDays:new Set(["mon","tue","wed","thu","fri"]),avoidBackToBackClasses:!1,theme:"wpi-classic"}}clearAllData(){try{Object.values(v.STORAGE_KEYS).forEach(e=>{localStorage.removeItem(e)})}catch(e){console.warn("Failed to clear storage:",e)}}exportData(){const e=this.loadUserState(),t=this.loadAllSchedules(),s=this.loadPreferences(),r={version:"1.0",timestamp:new Date().toISOString(),state:e,schedules:t,preferences:s};return JSON.stringify(r,null,2)}importData(e){try{const t=JSON.parse(e);return t.state&&this.saveUserState(t.state),t.preferences&&this.savePreferences(t.preferences),t.schedules&&t.schedules.forEach(s=>{this.saveSchedule(s)}),!0}catch(t){return console.error("Failed to import data:",t),!1}}handleStorageOperation(e,t,s){try{return e()}catch(r){return console.warn(`${t}:`,r),s}}saveThemePreference(e){try{localStorage.setItem(v.STORAGE_KEYS.THEME,e)}catch(t){console.warn("Failed to save theme preference:",t)}}loadThemePreference(){try{return localStorage.getItem(v.STORAGE_KEYS.THEME)||"wpi-classic"}catch(e){return console.warn("Failed to load theme preference:",e),"wpi-classic"}}saveSelectedCourses(e){this.handleStorageOperation(()=>{const t=JSON.stringify(e,this.replacer);localStorage.setItem(v.STORAGE_KEYS.SELECTED_COURSES,t)},"Failed to save selected courses")}loadSelectedCourses(){return this.handleStorageOperation(()=>{const e=localStorage.getItem(v.STORAGE_KEYS.SELECTED_COURSES);return e?JSON.parse(e,this.reviver):[]},"Failed to load selected courses",[])}clearSelectedCourses(){try{localStorage.removeItem(v.STORAGE_KEYS.SELECTED_COURSES)}catch(e){console.warn("Failed to clear selected courses:",e)}}};v.STORAGE_KEYS={USER_STATE:"wpi-planner-user-state",PREFERENCES:"wpi-planner-preferences",SCHEDULES:"wpi-planner-schedules",SELECTED_COURSES:"wpi-planner-selected-courses",THEME:"wpi-planner-theme"};let D=v;class me{constructor(){this.dropdownElement=null,this.optionsElement=null,this.currentThemeNameElement=null,this.isOpen=!1,this.themeManager=L.getInstance(),this.storageManager=new D,this.init()}init(){this.setupElements(),this.loadSavedTheme(),this.setupEventListeners(),this.renderThemeOptions()}setupElements(){this.dropdownElement=document.getElementById("theme-dropdown"),this.optionsElement=document.getElementById("theme-options"),this.currentThemeNameElement=document.getElementById("current-theme-name")}loadSavedTheme(){const e=this.storageManager.loadThemePreference();this.themeManager.setTheme(e),this.updateCurrentThemeDisplay()}setupEventListeners(){!this.dropdownElement||!this.optionsElement||(this.dropdownElement.addEventListener("click",e=>{e.stopPropagation(),this.toggleDropdown()}),document.addEventListener("click",()=>{this.closeDropdown()}),this.optionsElement.addEventListener("click",e=>{e.stopPropagation()}))}toggleDropdown(){this.isOpen?this.closeDropdown():this.openDropdown()}openDropdown(){!this.dropdownElement||!this.optionsElement||(this.isOpen=!0,this.dropdownElement.classList.add("open"),this.optionsElement.classList.add("show"))}closeDropdown(){!this.dropdownElement||!this.optionsElement||(this.isOpen=!1,this.dropdownElement.classList.remove("open"),this.optionsElement.classList.remove("show"))}renderThemeOptions(){if(!this.optionsElement)return;const e=this.themeManager.getAvailableThemes(),t=this.themeManager.getCurrentThemeId();let s="";e.forEach(r=>{const i=r.id===t;s+=`
                <div class="theme-option ${i?"active":""}" data-theme-id="${r.id}">
                    <div class="theme-option-name">${r.name}</div>
                    <div class="theme-option-description">${r.description}</div>
                </div>
            `}),this.optionsElement.innerHTML=s,this.optionsElement.querySelectorAll(".theme-option").forEach(r=>{r.addEventListener("click",()=>{const i=r.dataset.themeId;i&&this.selectTheme(i)})})}selectTheme(e){this.themeManager.setTheme(e)&&(this.storageManager.saveThemePreference(e),this.updateCurrentThemeDisplay(),this.updateActiveOption(e),this.closeDropdown())}updateCurrentThemeDisplay(){if(!this.currentThemeNameElement)return;const e=this.themeManager.getCurrentTheme();e&&(this.currentThemeNameElement.textContent=e.name)}updateActiveOption(e){if(!this.optionsElement)return;this.optionsElement.querySelectorAll(".theme-option").forEach(s=>{s.classList.remove("active")});const t=this.optionsElement.querySelector(`[data-theme-id="${e}"]`);t&&t.classList.add("active")}refresh(){this.renderThemeOptions(),this.updateCurrentThemeDisplay()}setTheme(e){this.selectTheme(e)}}class fe{constructor(){this.selectedCourses=new Map,this.listeners=new Set,this.allSections=new Set,this.allDepartments=[]}addCourse(e,t=!1){const s={course:e,selectedSection:null,selectedSectionNumber:null,isRequired:t};this.selectedCourses.set(e,s),this.notifyListeners()}removeCourse(e){this.selectedCourses.delete(e),this.notifyListeners()}getSelectedCourses(){return Array.from(this.selectedCourses.values())}getSelectedCourse(e){return this.selectedCourses.get(e)}isSelected(e){return this.selectedCourses.has(e)}getAvailableSections(e){const t=this.selectedCourses.get(e);return this.validateCourseExists(e,t)?t.course.sections:[]}clearAll(){this.selectedCourses.clear(),this.notifyListeners()}onSelectionChange(e){this.listeners.add(e)}offSelectionChange(e){this.listeners.delete(e)}setSelectedSection(e,t){const s=this.selectedCourses.get(e);if(!this.validateCourseExists(e,s))return;const r=t&&e.sections.find(i=>i.number===t)||null;s.selectedSection=r,s.selectedSectionNumber=t,this.notifyListeners()}getSelectedSection(e){return this.selectedCourses.get(e)?.selectedSectionNumber||null}getSelectedSectionObject(e){return this.selectedCourses.get(e)?.selectedSection||null}loadSelectedCourses(e){this.selectedCourses.clear(),e.forEach(t=>{if(t.selectedSection&&typeof t.selectedSection=="string"){const s=t.selectedSection,r=t.course.sections.find(i=>i.number===s)||null;t.selectedSection=r,t.selectedSectionNumber=s}else t.selectedSection&&!t.selectedSectionNumber&&(t.selectedSectionNumber=t.selectedSection.number);this.selectedCourses.set(t.course,t)}),this.notifyListeners()}validateCourseExists(e,t){return t?!0:(console.warn(`Course ${e.id} not found in selected courses`),!1)}notifyListeners(){const e=this.getSelectedCourses();this.listeners.forEach(t=>t(e))}setAllDepartments(e){this.allDepartments=e,this.populateAllSections()}populateAllSections(){this.allSections.clear();for(const e of this.allDepartments)for(const t of e.courses)for(const s of t.sections)this.allSections.add(s);console.log(`CourseManager: Populated ${this.allSections.size} sections from ${this.allDepartments.length} departments`)}getAllSections(){return Array.from(this.allSections)}getAllSectionsForCourse(e){return e.sections}getAllSectionsForDepartment(e){const t=this.allDepartments.find(r=>r.abbreviation===e);if(!t)return[];const s=[];for(const r of t.courses)s.push(...r.sections);return s}getAllDepartments(){return this.allDepartments}reconstructSectionObjects(){console.log("=== RECONSTRUCTING SECTION OBJECTS ===");let e=0,t=0;this.selectedCourses.forEach((s,r)=>{if(s.selectedSectionNumber&&!s.selectedSection){console.log(`Reconstructing section for ${r.department.abbreviation}${r.number}:`),console.log(`  Looking for section: ${s.selectedSectionNumber}`),console.log(`  Course has ${r.sections.length} sections:`,r.sections.map(o=>o.number));const i=r.sections.find(o=>o.number===s.selectedSectionNumber)||null;i?(s.selectedSection=i,e++,console.log(`  ✓ Successfully reconstructed section ${i.number}`)):(t++,console.log(`  ✗ Failed to find section ${s.selectedSectionNumber}`))}else s.selectedSection&&console.log(`Section already exists for ${r.department.abbreviation}${r.number}: ${s.selectedSection.number}`)}),console.log(`Reconstruction complete: ${e} succeeded, ${t} failed`),console.log(`=== END SECTION RECONSTRUCTION ===
`),e>0&&this.notifyListeners()}findCourseContainingSection(e){for(const t of this.allDepartments)for(const s of t.courses)if(s.sections.includes(e))return s}}class E{static isValidCourse(e){return e&&typeof e.id=="string"&&typeof e.number=="string"&&typeof e.name=="string"&&typeof e.description=="string"&&this.isValidDepartment(e.department)&&Array.isArray(e.sections)&&e.sections.every(t=>this.isValidSection(t))&&typeof e.minCredits=="number"&&typeof e.maxCredits=="number"}static isValidDepartment(e){return e&&typeof e.abbreviation=="string"&&typeof e.name=="string"&&(e.courses===void 0||Array.isArray(e.courses))}static isValidSection(e){return e&&typeof e.crn=="number"&&typeof e.number=="string"&&typeof e.seats=="number"&&typeof e.seatsAvailable=="number"&&typeof e.actualWaitlist=="number"&&typeof e.maxWaitlist=="number"&&typeof e.description=="string"&&typeof e.term=="string"&&Array.isArray(e.periods)&&e.periods.every(t=>this.isValidPeriod(t))}static isValidPeriod(e){return e&&typeof e.type=="string"&&typeof e.professor=="string"&&this.isValidTime(e.startTime)&&this.isValidTime(e.endTime)&&typeof e.location=="string"&&typeof e.building=="string"&&typeof e.room=="string"&&typeof e.seats=="number"&&typeof e.seatsAvailable=="number"&&typeof e.actualWaitlist=="number"&&typeof e.maxWaitlist=="number"&&e.days instanceof Set}static isValidTime(e){return e&&typeof e.hours=="number"&&typeof e.minutes=="number"&&typeof e.displayTime=="string"&&e.hours>=0&&e.hours<=23&&e.minutes>=0&&e.minutes<=59}static isValidSchedulePreferences(e){return e&&this.isValidTimeRange(e.preferredTimeRange)&&e.preferredDays instanceof Set&&typeof e.avoidBackToBackClasses=="boolean"}static isValidTimeRange(e){return e&&this.isValidTime(e.startTime)&&this.isValidTime(e.endTime)}static isValidSelectedCourse(e){return e&&this.isValidCourse(e.course)&&typeof e.isRequired=="boolean"}static isValidSchedule(e){return e&&typeof e.id=="string"&&typeof e.name=="string"&&Array.isArray(e.selectedCourses)&&e.selectedCourses.every(t=>this.isValidSelectedCourse(t))&&Array.isArray(e.generatedSchedules)&&this.isValidSchedulePreferences(e.preferences)}static sanitizeString(e){return e.replace(/<[^>]*>/g,"").trim()}static sanitizeCourseData(e){try{return this.isValidCourse(e)?{...e,name:this.sanitizeString(e.name),description:this.sanitizeString(e.description),sections:e.sections.map(t=>({...t,description:this.sanitizeString(t.description),periods:t.periods.map(s=>({...s,professor:this.sanitizeString(s.professor),location:this.sanitizeString(s.location),building:this.sanitizeString(s.building),room:this.sanitizeString(s.room)}))}))}:null}catch(t){return console.warn("Error sanitizing course data:",t),null}}static validateCourseId(e){return/^[A-Z]{2,4}-\d{3,4}$/.test(e)}static validateSectionNumber(e){return typeof e=="string"&&e.trim().length>0&&/^[\w\s\-/]+$/.test(e)}static validateEmail(e){return/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)}}class pe{constructor(e,t){this.courseManager=e||new fe,this.storageManager=t||new D,this.loadPersistedSelections(),this.setupPersistenceListener()}selectCourse(e,t=!1){if(!E.isValidCourse(e))throw new Error("Invalid course object provided");this.courseManager.addCourse(e,t)}unselectCourse(e){if(!E.isValidCourse(e))throw new Error("Invalid course object provided");this.courseManager.removeCourse(e)}toggleCourseSelection(e,t=!1){return this.isCourseSelected(e)?(this.unselectCourse(e),!1):(this.selectCourse(e,t),!0)}setSelectedSection(e,t){if(!E.isValidCourse(e))throw new Error("Invalid course object provided");if(t!==null&&!E.validateSectionNumber(t))throw new Error("Invalid sectionNumber provided");this.courseManager.setSelectedSection(e,t)}getSelectedSection(e){if(!E.isValidCourse(e))throw new Error("Invalid course object provided");return this.courseManager.getSelectedSection(e)}getSelectedSectionObject(e){if(!E.isValidCourse(e))throw new Error("Invalid course object provided");return this.courseManager.getSelectedSectionObject(e)}isCourseSelected(e){return E.isValidCourse(e)?this.courseManager.isSelected(e):!1}getSelectedCourses(){return this.courseManager.getSelectedCourses()}getSelectedCourse(e){if(E.isValidCourse(e))return this.courseManager.getSelectedCourse(e)}clearAllSelections(){this.courseManager.clearAll(),this.storageManager.clearSelectedCourses()}getSelectedCoursesCount(){return this.getSelectedCourses().length}getSelectedCourseIds(){return this.getSelectedCourses().map(e=>e.course.id)}onSelectionChange(e){this.courseManager.onSelectionChange(e)}offSelectionChange(e){this.courseManager.offSelectionChange(e)}loadPersistedSelections(){const e=this.storageManager.loadSelectedCourses();e.length>0&&this.courseManager.loadSelectedCourses(e)}setupPersistenceListener(){this.courseManager.onSelectionChange(e=>{this.storageManager.saveSelectedCourses(e)})}persistSelections(){const e=this.getSelectedCourses();this.storageManager.saveSelectedCourses(e)}exportSelections(){const e=this.getSelectedCourses();return JSON.stringify({version:"1.0",timestamp:new Date().toISOString(),selectedCourses:e},null,2)}importSelections(e){try{const t=JSON.parse(e);return t.selectedCourses&&Array.isArray(t.selectedCourses)?(this.courseManager.loadSelectedCourses(t.selectedCourses),!0):!1}catch(t){return console.error("Failed to import selections:",t),!1}}setAllDepartments(e){this.courseManager.setAllDepartments(e)}getAllSections(){return this.courseManager.getAllSections()}getAllSectionsForCourse(e){return this.courseManager.getAllSectionsForCourse(e)}getAllSectionsForDepartment(e){return this.courseManager.getAllSectionsForDepartment(e)}findCourseById(e){for(const t of this.courseManager.getAllDepartments()){const s=t.courses.find(r=>r.id===e);if(s)return s}}unselectCourseById(e){const t=this.findCourseById(e);t&&this.unselectCourse(t)}isCourseSelectedById(e){const t=this.findCourseById(e);return t?this.isCourseSelected(t):!1}setSelectedSectionById(e,t){const s=this.findCourseById(e);s&&this.setSelectedSection(s,t)}getSelectedSectionById(e){const t=this.findCourseById(e);return t?this.getSelectedSection(t):null}getSelectedCourseById(e){const t=this.findCourseById(e);return t?this.getSelectedCourse(t):void 0}reconstructSectionObjects(){this.courseManager.reconstructSectionObjects()}}var O=(u=>(u.TIME_OVERLAP="time_overlap",u))(O||{});class ge{constructor(){this.conflictCache=new Map}detectConflicts(e){const t=[];for(let s=0;s<e.length;s++)for(let r=s+1;r<e.length;r++){const i=this.getCacheKey(e[s],e[r]);let o=this.conflictCache.get(i);o||(o=this.checkSectionConflicts(e[s],e[r]),this.conflictCache.set(i,o)),t.push(...o)}return t}checkSectionConflicts(e,t){const s=[];for(const r of e.periods)for(const i of t.periods){const o=this.checkPeriodConflict(r,i,e,t);o&&s.push(o)}return s}checkPeriodConflict(e,t,s,r){const i=this.getSharedDays(e.days,t.days);return i.length===0?null:this.hasTimeOverlap(e,t)?{section1:s,section2:r,conflictType:O.TIME_OVERLAP,description:`Time overlap on ${i.join(", ")}: ${e.startTime.displayTime}-${e.endTime.displayTime} conflicts with ${t.startTime.displayTime}-${t.endTime.displayTime}`}:null}getSharedDays(e,t){return Array.from(new Set([...e].filter(s=>t.has(s))))}hasTimeOverlap(e,t){const s=this.timeToMinutes(e.startTime),r=this.timeToMinutes(e.endTime),i=this.timeToMinutes(t.startTime),o=this.timeToMinutes(t.endTime);return s<o&&i<r}timeToMinutes(e){return e.hours*60+e.minutes}isValidSchedule(e){return this.detectConflicts(e).length===0}clearCache(){this.conflictCache.clear()}getCacheKey(e,t){const s=`${e.crn}-${t.crn}`,r=`${t.crn}-${e.crn}`;return s<r?s:r}}class ve{constructor(){this.modals=new Map,this.currentZIndex=1e3}showModal(e,t){this.hideModal(e),t.style.zIndex=this.currentZIndex.toString(),this.currentZIndex+=10,this.modals.set(e,t),document.body.appendChild(t),requestAnimationFrame(()=>{t.classList.add("show")})}hideModal(e){const t=this.modals.get(e);t&&(t.classList.add("hide"),setTimeout(()=>{t.parentNode&&t.parentNode.removeChild(t),this.modals.delete(e)},200))}hideAllModals(){Array.from(this.modals.keys()).forEach(t=>this.hideModal(t))}isModalOpen(e){return this.modals.has(e)}getOpenModals(){return Array.from(this.modals.keys())}generateId(){return`modal-${Date.now()}-${Math.random().toString(36).substr(2,9)}`}setupModalBehavior(e,t,s={}){const{closeOnBackdrop:r=!0,closeOnEscape:i=!0}=s;if(r&&e.addEventListener("click",o=>{o.target===e&&this.hideModal(t)}),i){const o=n=>{n.key==="Escape"&&(this.hideModal(t),document.removeEventListener("keydown",o))};document.addEventListener("keydown",o)}}}class Se{constructor(){this.allDepartments=[],this.selectedDepartment=null,this.departmentCategories={BB:"Science",BCB:"Science",CH:"Science",CS:"Science",DS:"Science",GE:"Science",IMGD:"Science",MA:"Science",MTE:"Science",PTE:"Science",NE:"Science",PH:"Science",AE:"Engineering",AR:"Engineering",ARE:"Engineering",BME:"Engineering",CE:"Engineering",CHE:"Engineering",ECE:"Engineering",ES:"Engineering",FP:"Engineering",ME:"Engineering",MFE:"Engineering",MSE:"Engineering",NUE:"Engineering",RBE:"Engineering",SYE:"Engineering",BUS:"Business & Management",ECON:"Business & Management",MIS:"Business & Management",OIE:"Business & Management",EN:"Humanities & Arts",HI:"Humanities & Arts",HU:"Humanities & Arts",MU:"Humanities & Arts",RE:"Humanities & Arts",SP:"Humanities & Arts",TH:"Humanities & Arts",WR:"Humanities & Arts",GOV:"Social Sciences",PSY:"Social Sciences",SOC:"Social Sciences",SS:"Social Sciences"}}setAllDepartments(e){this.allDepartments=e}getSelectedDepartment(){return this.selectedDepartment}selectDepartment(e){const t=this.allDepartments.find(r=>r.abbreviation===e);if(!t)return null;this.selectedDepartment=t;const s=document.querySelector(".content-header h2");return s&&(s.textContent=`${t.name} Courses`),t}displayDepartments(){const e=document.getElementById("department-list");if(!e)return;const t=this.groupDepartmentsByCategory();let s="";Object.entries(t).forEach(([r,i])=>{i.length!==0&&(s+=`
                <div class="department-category">
                    <div class="category-header">${r}</div>
                    <div class="department-list">
            `,i.forEach(o=>{const n=o.courses.length;s+=`
                    <div class="department-item" data-dept-id="${o.abbreviation}">
                        ${o.name} (${n})
                    </div>
                `}),s+=`
                    </div>
                </div>
            `)}),e.innerHTML=s}groupDepartmentsByCategory(){const e={Science:[],Engineering:[],"Business & Management":[],"Humanities & Arts":[],"Social Sciences":[],Other:[]};return this.allDepartments.forEach(t=>{const s=this.departmentCategories[t.abbreviation]||"Other";e[s].push(t)}),Object.keys(e).forEach(t=>{e[t].sort((s,r)=>s.name.localeCompare(r.name))}),e}handleDepartmentClick(e){const t=this.selectDepartment(e);document.querySelectorAll(".department-item").forEach(r=>{r.classList.remove("active")});const s=document.querySelector(`[data-dept-id="${e}"]`);return s&&s.classList.add("active"),t}clearDepartmentSelection(){this.selectedDepartment=null,document.querySelectorAll(".department-item").forEach(e=>{e.classList.remove("active")})}}class ye{constructor(e){this.allDepartments=[],this.selectedCourse=null,this.filterService=null,this.elementToCourseMap=new WeakMap,this.courseSelectionService=e}setFilterService(e){this.filterService=e}setAllDepartments(e){this.allDepartments=e}getSelectedCourse(){return this.selectedCourse}displayCourses(e,t){t==="grid"?this.displayCoursesGrid(e):this.displayCoursesList(e)}displayCoursesList(e){const t=document.getElementById("course-container");if(!t)return;if(e.length===0){t.innerHTML='<div class="empty-state">No courses found in this department.</div>';return}const s=e.sort((o,n)=>o.number.localeCompare(n.number));let r='<div class="course-list">';s.forEach(o=>{const n=this.courseHasWarning(o);o.sections.map(c=>c.number).filter(Boolean);const a=this.courseSelectionService.isCourseSelected(o);r+=`
                <div class="course-item ${a?"selected":""}">
                    <div class="course-header">
                        <button class="course-select-btn ${a?"selected":""}" title="${a?"Remove from selection":"Add to selection"}">
                            ${a?"✓":"+"}
                        </button>
                        <div class="course-code">${o.department.abbreviation}${o.number}</div>
                        <div class="course-details">
                            <div class="course-name">
                                ${o.name}
                                ${n?'<span class="warning-icon">⚠</span>':""}
                            </div>
                            <div class="course-sections">
                                ${o.sections.map(c=>`<span class="section-badge ${c.seatsAvailable<=0?"full":""}" data-section="${c.number}">${c.number}</span>`).join("")}
                            </div>
                        </div>
                    </div>
                </div>
            `}),r+="</div>",t.innerHTML=r,t.querySelectorAll(".course-item").forEach((o,n)=>{this.elementToCourseMap.set(o,s[n])})}displayCoursesGrid(e){const t=document.getElementById("course-container");if(!t)return;if(e.length===0){t.innerHTML='<div class="empty-state">No courses found in this department.</div>';return}const s=e.sort((o,n)=>o.number.localeCompare(n.number));let r='<div class="course-grid">';s.forEach(o=>{const n=this.courseHasWarning(o),a=this.courseSelectionService.isCourseSelected(o),c=o.minCredits===o.maxCredits?o.minCredits:`${o.minCredits}-${o.maxCredits}`;r+=`
                <div class="course-card ${a?"selected":""}">
                    <div class="course-card-header">
                        <div class="course-code">${o.department.abbreviation}${o.number}</div>
                        <button class="course-select-btn ${a?"selected":""}" title="${a?"Remove from selection":"Add to selection"}">
                            ${a?"✓":"+"}
                        </button>
                    </div>
                    <div class="course-title">
                        ${o.name}
                        ${n?'<span class="warning-icon">⚠</span>':""}
                    </div>
                    <div class="course-info">
                        <span class="course-credits">${c} credits</span>
                        <span class="course-sections-count">${o.sections.length} section${o.sections.length!==1?"s":""}</span>
                    </div>
                </div>
            `}),r+="</div>",t.innerHTML=r,t.querySelectorAll(".course-card").forEach((o,n)=>{this.elementToCourseMap.set(o,s[n])})}courseHasWarning(e){return e.sections.every(t=>t.seatsAvailable<=0)}handleSearch(e,t){const s=t?t.courses:this.getAllCourses();if(this.filterService){const i=this.filterService.searchAndFilter(e,s);return this.updateSearchHeader(e,i.length,t),i}if(!e.trim())return s;const r=s.filter(i=>i.name.toLowerCase().includes(e.toLowerCase())||i.number.toLowerCase().includes(e.toLowerCase())||i.id.toLowerCase().includes(e.toLowerCase()));return this.updateSearchHeader(e,r.length,t),r}handleFilter(e){const t=e?e.courses:this.getAllCourses();if(this.filterService&&!this.filterService.isEmpty()){const s=this.filterService.filterCourses(t);return this.updateFilterHeader(s.length,e),s}return t}getAllCourses(){const e=[];return this.allDepartments.forEach(t=>{e.push(...t.courses)}),e}updateSearchHeader(e,t,s){const r=document.querySelector(".content-header h2");r&&(e.trim()?r.textContent=`Search Results (${t})`:s?r.textContent=`${s.name} (${t})`:r.textContent=`All Courses (${t})`)}updateFilterHeader(e,t){const s=document.querySelector(".content-header h2");if(s){let r=t?t.name:"All Courses";if(this.filterService&&!this.filterService.isEmpty()){const i=this.filterService.getFilterSummary();r+=` (${e}) - ${i}`}else r+=` (${e})`;s.textContent=r}}selectCourse(e){const t=this.elementToCourseMap.get(e);return t?(this.selectedCourse=t,this.displayCourseDescription(t),document.querySelectorAll(".course-item, .course-card").forEach(s=>{s.classList.remove("active")}),e.classList.add("active"),t):null}selectCourseById(e){if(!this.courseSelectionService.findCourseById(e))return null;const s=document.querySelectorAll(".course-item, .course-card");for(const r of s)if(this.elementToCourseMap.get(r)?.id===e)return this.selectCourse(r);return null}toggleCourseSelection(e){const t=this.elementToCourseMap.get(e);if(!t)return!1;const s=this.courseSelectionService.toggleCourseSelection(t);return this.updateCourseSelectionUI(e,s),s}toggleCourseSelectionById(e){if(!this.courseSelectionService.findCourseById(e))return!1;const s=document.querySelectorAll(".course-item, .course-card");for(const r of s)if(this.elementToCourseMap.get(r)?.id===e)return this.toggleCourseSelection(r);return!1}updateCourseSelectionUI(e,t){const s=e.querySelector(".course-select-btn");s&&(t?(e.classList.add("selected"),s.textContent="✓",s.classList.add("selected")):(e.classList.remove("selected"),s.textContent="+",s.classList.remove("selected")))}refreshCourseSelectionUI(){document.querySelectorAll(".course-item, .course-card").forEach(e=>{const t=this.elementToCourseMap.get(e);if(t){const s=this.courseSelectionService.isCourseSelected(t);this.updateCourseSelectionUI(e,s)}})}displayCourseDescription(e){const t=document.getElementById("course-description");if(!t)return;const s=`
            <div class="course-info">
                <div class="course-title">${e.name}</div>
                <div class="course-code">${e.department.abbreviation}${e.number} (${e.minCredits===e.maxCredits?e.minCredits:`${e.minCredits}-${e.maxCredits}`} credits)</div>
            </div>
            <div class="course-description-text">${e.description}</div>
        `;t.innerHTML=s}clearCourseDescription(){const e=document.getElementById("course-description");e&&(e.innerHTML='<div class="empty-state">Select a course to view description</div>')}clearCourseSelection(){this.selectedCourse=null,this.clearCourseDescription()}displaySelectedCourses(){const e=document.getElementById("selected-courses-list"),t=document.getElementById("selected-count");if(!e||!t)return;const s=this.courseSelectionService.getSelectedCourses();if(t.textContent=`(${s.length})`,s.length===0){e.innerHTML='<div class="empty-state">No courses selected yet</div>';return}const r=s.sort((n,a)=>{const c=n.course.department.abbreviation.localeCompare(a.course.department.abbreviation);return c!==0?c:n.course.number.localeCompare(a.course.number)});let i="";r.forEach(n=>{const a=n.course,c=a.minCredits===a.maxCredits?`${a.minCredits} credits`:`${a.minCredits}-${a.maxCredits} credits`;i+=`
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
            `}),e.innerHTML=i,e.querySelectorAll(".course-remove-btn").forEach((n,a)=>{this.elementToCourseMap.set(n,r[a].course)})}getCourseFromElement(e){return this.elementToCourseMap.get(e)}}const m=class m{static timeToGridRow(e){return m.timeToGridRowStart(e)}static timeToGridRowStart(e){const t=e.hours*60+e.minutes,s=m.START_HOUR*60,r=t-s,i=Math.floor(r/30);return Math.max(0,Math.min(i,m.TOTAL_TIME_SLOTS-1))}static timeToGridRowEnd(e){const t=e.hours*60+e.minutes,s=m.START_HOUR*60,r=t-s,i=Math.ceil(r/30),o=Math.max(0,Math.min(i,m.TOTAL_TIME_SLOTS-1));return r%30!==0&&console.log(`Rounded UP: ${e.hours}:${e.minutes.toString().padStart(2,"0")} -> slot ${i} (${r} min = ${r/30} slots)`),o}static dayToGridColumn(e){return m.DAYS_ORDER.indexOf(e)}static calculateDuration(e,t){const s=m.timeToGridRow(e),r=m.timeToGridRow(t);return Math.max(1,r-s)}static isTimeInBounds(e){return e.hours>=m.START_HOUR&&e.hours<m.END_HOUR}static formatTime(e){if(e.displayTime)return e.displayTime;const t=e.hours===0?12:e.hours>12?e.hours-12:e.hours,s=e.hours>=12?"PM":"AM",r=e.minutes.toString().padStart(2,"0");return`${t}:${r} ${s}`}static formatTimeRange(e,t){const s=m.formatTime(e),r=m.formatTime(t);return e.hours<12&&t.hours<12?`${s.replace(" AM","")}-${r}`:e.hours>=12&&t.hours>=12?`${s.replace(" PM","")}-${r}`:`${s}-${r}`}static formatDays(e){const t={[d.MONDAY]:"M",[d.TUESDAY]:"T",[d.WEDNESDAY]:"W",[d.THURSDAY]:"R",[d.FRIDAY]:"F",[d.SATURDAY]:"S",[d.SUNDAY]:"U"};return m.DAYS_ORDER.filter(s=>e.has(s)).map(s=>t[s]).join("")}static generateTimeLabels(){const e=[];for(let t=0;t<m.TOTAL_TIME_SLOTS;t++){const s=Math.floor(t/m.SLOTS_PER_HOUR)+m.START_HOUR,r=t%m.SLOTS_PER_HOUR*30;e.push(m.formatTime({hours:s,minutes:r,displayTime:""}))}return e}static getDayName(e){return{[d.MONDAY]:"Monday",[d.TUESDAY]:"Tuesday",[d.WEDNESDAY]:"Wednesday",[d.THURSDAY]:"Thursday",[d.FRIDAY]:"Friday",[d.SATURDAY]:"Saturday",[d.SUNDAY]:"Sunday"}[e]}static getDayAbbr(e){return{[d.MONDAY]:"Mon",[d.TUESDAY]:"Tue",[d.WEDNESDAY]:"Wed",[d.THURSDAY]:"Thu",[d.FRIDAY]:"Fri",[d.SATURDAY]:"Sat",[d.SUNDAY]:"Sun"}[e]}};m.START_HOUR=7,m.END_HOUR=19,m.TOTAL_HOURS=12,m.SLOTS_PER_HOUR=2,m.TOTAL_TIME_SLOTS=m.TOTAL_HOURS*m.SLOTS_PER_HOUR,m.DAYS_ORDER=[d.MONDAY,d.TUESDAY,d.WEDNESDAY,d.THURSDAY,d.FRIDAY,d.SATURDAY,d.SUNDAY];let y=m;class be{constructor(e){this.sectionInfoModalController=null,this.elementToCourseMap=new WeakMap,this.courseSelectionService=e}setSectionInfoModalController(e){this.sectionInfoModalController=e}setStatePreserver(e){this.statePreserver=e}displayScheduleSelectedCourses(){const e=document.getElementById("schedule-selected-courses"),t=document.getElementById("schedule-selected-count");if(!e||!t)return;const s=this.statePreserver?.preserve(),r=this.courseSelectionService.getSelectedCourses();if(t.textContent=`(${r.length})`,r.length===0){e.innerHTML='<div class="empty-state">No courses selected yet</div>';return}const i=r.sort((l,h)=>{const f=l.course.department.abbreviation.localeCompare(h.course.department.abbreviation);return f!==0?f:l.course.number.localeCompare(h.course.number)});let o="";i.forEach(l=>{const h=l.course,f=h.minCredits===h.maxCredits?`${h.minCredits} credits`:`${h.minCredits}-${h.maxCredits} credits`,p={};h.sections.forEach(S=>{p[S.term]||(p[S.term]=[]),p[S.term].push(S)}),o+=`
                <div class="schedule-course-item collapsed" >
                    <div class="schedule-course-header dropdown-trigger" >
                        <div class="schedule-course-info">
                            <div class="schedule-course-code">${h.department.abbreviation}${h.number}</div>
                            <div class="schedule-course-name">${h.name}</div>
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
            `,Object.keys(p).sort().forEach(S=>{o+=`<div class="term-sections" data-term="${S}">`,o+=`<div class="term-label">${S} Term</div>`,p[S].forEach(C=>{const $=l.selectedSectionNumber===C.number,A=$?"selected":"",M=[...C.periods].sort((g,F)=>{const w=I=>{const T=I.toLowerCase();return T.includes("lec")||T.includes("lecture")?1:T.includes("lab")?2:T.includes("dis")||T.includes("discussion")||T.includes("rec")?3:4};return w(g.type)-w(F.type)});o+=`
                        <div class="section-option ${A}"  data-section="${C.number}">
                            <div class="section-info">
                                <div class="section-number">${C.number}</div>
                                <div class="section-periods">`,M.forEach((g,F)=>{const w=y.formatTimeRange(g.startTime,g.endTime),I=y.formatDays(g.days),T=this.getPeriodTypeLabel(g.type);o+=`
                            <div class="period-info" data-period-type="${g.type.toLowerCase()}">
                                <div class="period-header">
                                    <span class="period-type-label">${T}</span>
                                    <span class="period-schedule">${I} ${w}</span>
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
            `}),e.innerHTML=o;const n=e.querySelectorAll(".schedule-course-item"),a=e.querySelectorAll(".course-remove-btn");n.forEach((l,h)=>{const f=i[h]?.course;this.elementToCourseMap.set(l,f)}),a.forEach((l,h)=>{const f=i[h]?.course;this.elementToCourseMap.set(l,f)}),e.querySelectorAll(".section-select-btn").forEach(l=>{const h=l.closest(".schedule-course-item");if(h){const f=Array.from(n).indexOf(h);if(f>=0&&f<i.length){const p=i[f].course;this.elementToCourseMap.set(l,p)}}}),s&&setTimeout(()=>{this.statePreserver?.restore(s)},0)}handleSectionSelection(e,t){this.courseSelectionService.getSelectedSection(e)===t?this.courseSelectionService.setSelectedSection(e,null):this.courseSelectionService.setSelectedSection(e,t)}updateSectionButtonStates(e,t){let s=null;if(document.querySelectorAll(".schedule-course-item").forEach(o=>{const n=this.elementToCourseMap.get(o);n&&n.id===e.id&&(s=o)}),!s)return;const r=s.querySelectorAll(".section-select-btn"),i=s.querySelectorAll(".section-option");r.forEach(o=>{o.dataset.section===t?(o.classList.add("selected"),o.textContent="✓"):(o.classList.remove("selected"),o.textContent="+")}),i.forEach(o=>{o.dataset.section===t?o.classList.add("selected"):o.classList.remove("selected")})}renderScheduleGrids(){const e=this.courseSelectionService.getSelectedCourses(),t=["A","B","C","D"];console.log(`
=== RENDER SCHEDULE GRIDS ===`),console.log(`Processing ${e.length} selected courses for terms: ${t.join(", ")}`),t.forEach(s=>{const r=document.getElementById(`schedule-grid-${s}`);if(!r)return;const i=e.filter(o=>{if(!(o.selectedSection!==null))return!1;console.log(`  Checking course ${o.course.department.abbreviation}${o.course.number} with term "${o.selectedSection.term}" against grid term "${s}"`);const a=this.extractTermLetter(o.selectedSection.term,o.selectedSection.number),c=a===s;return console.log(`    Extracted term letter: "${a}" from term:"${o.selectedSection.term}" section:"${o.selectedSection.number}"`),c});if(console.log(`Term ${s}: ${i.length} courses`),i.forEach(o=>{console.log(`  ${o.course.department.abbreviation}${o.course.number} (${o.selectedSection.periods.length} periods)`)}),i.length===0){const o=e.filter(n=>!n.selectedSection);this.renderEmptyGrid(r,s,o.length>0);return}this.renderPopulatedGrid(r,i,s)}),console.log(`=== END RENDER SCHEDULE GRIDS ===
`)}renderEmptyGrid(e,t,s=!1){const r=s?`No sections selected for ${t} term<br><small>Select specific sections in the left panel to see schedule</small>`:`No classes scheduled for ${t} term`;e.innerHTML=`
            <div class="empty-schedule">
                <div class="empty-message">${r}</div>
            </div>
        `,e.classList.add("empty")}renderPopulatedGrid(e,t,s){e.classList.remove("empty");const r=[d.MONDAY,d.TUESDAY,d.WEDNESDAY,d.THURSDAY,d.FRIDAY],i=y.TOTAL_TIME_SLOTS;let o="";o+='<div class="time-label"></div>',r.forEach(n=>{o+=`<div class="day-header">${y.getDayAbbr(n)}</div>`});for(let n=0;n<i;n++){const a=Math.floor(n/y.SLOTS_PER_HOUR)+y.START_HOUR,c=n%y.SLOTS_PER_HOUR*30,l=y.formatTime({hours:a,minutes:c,displayTime:""});o+=`<div class="time-label">${l}</div>`,r.forEach(h=>{const f=this.getCellContent(t,h,n);o+=`<div class="schedule-cell ${f.classes}" data-day="${h}" data-slot="${n}" style="position: relative;">${f.content}</div>`})}e.innerHTML=o,this.addSectionBlockEventListeners(e)}getCellContent(e,t,s){const r=[],i=s<12&&e.length>0;if(i&&e.length>0){const p=Math.floor(s/2)+7,x=s%2*30;console.log(`
--- getCellContent: ${t} ${p}:${x.toString().padStart(2,"0")} (slot ${s}) ---`),console.log(`Checking ${e.length} courses for this time slot`)}for(const p of e){if(!p.selectedSection)continue;const x=p.selectedSection,S=x.periods.filter(g=>g.days.has(t));i&&S.length>0&&(console.log(`  Course ${p.course.department.abbreviation}${p.course.number} has ${S.length} periods on ${t}:`),S.forEach(g=>{console.log(`    ${g.type}: ${g.startTime.hours}:${g.startTime.minutes.toString().padStart(2,"0")}-${g.endTime.hours}:${g.endTime.minutes.toString().padStart(2,"0")}`)}));let C=!1,$=1/0,A=-1,M=!1;for(const g of S){const F=y.timeToGridRowStart(g.startTime),w=y.timeToGridRowEnd(g.endTime);i&&console.log(`    Checking period ${g.type}: slots ${F}-${w} vs current slot ${s}`),s>=F&&s<w&&(C=!0,$=Math.min($,F),A=Math.max(A,w),i&&console.log(`      ✓ MATCHES! Period occupies slot ${s}`))}C&&(M=s===$,i&&console.log(`    Course ${p.course.department.abbreviation}${p.course.number} occupies slot, isFirstSlot: ${M}`),r.push({course:p,section:x,periodsOnThisDay:S,startSlot:$,endSlot:A,isFirstSlot:M}))}if(r.length===0)return{content:"",classes:""};const o=r.length>1,n=r[0],a=this.getCourseColor(n.course.course.id),c=n.endSlot-n.startSlot,l=c*30;console.log(`Course ${n.course.course.department.abbreviation}${n.course.course.number} should span ${c} rows (${l}px) from slot ${n.startSlot} to ${n.endSlot}`);const h=n.isFirstSlot?`
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
        `:"",f=n.isFirstSlot?`occupied section-start ${o?"has-conflict":""}`:"";return{content:h,classes:f}}formatSectionPeriods(e){if(e.length===0)return"";const t={};for(const o of e){const n=this.getPeriodTypeLabel(o.type);t[n]||(t[n]=[]),t[n].push(o)}const s=[],r=["LEC","LAB","DIS","REC","SEM","STU","CONF"],i=Object.keys(t).sort((o,n)=>{const a=r.indexOf(o),c=r.indexOf(n);return(a===-1?999:a)-(c===-1?999:c)});for(const o of i){const a=t[o].map(c=>y.formatTimeRange(c.startTime,c.endTime)).join(", ");s.push(`<div class="period-type-info">
                <span class="period-type">${o}</span>
                <span class="period-times">${a}</span>
            </div>`)}return s.join("")}getCourseColor(e){const t=["#4CAF50","#2196F3","#FF9800","#9C27B0","#F44336","#00BCD4","#795548","#607D8B","#3F51B5","#E91E63"];let s=0;for(let r=0;r<e.length;r++)s=e.charCodeAt(r)+((s<<5)-s);return t[Math.abs(s)%t.length]}getPeriodTypeLabel(e){const t=e.toLowerCase();return t.includes("lec")||t.includes("lecture")?"LEC":t.includes("lab")?"LAB":t.includes("dis")||t.includes("discussion")?"DIS":t.includes("rec")||t.includes("recitation")?"REC":t.includes("sem")||t.includes("seminar")?"SEM":t.includes("studio")?"STU":t.includes("conference")||t.includes("conf")?"CONF":e.substring(0,Math.min(4,e.length)).toUpperCase()}getPeriodTypeClass(e){const t=e.toLowerCase();return t.includes("lec")||t.includes("lecture")?"period-lecture":t.includes("lab")?"period-lab":t.includes("dis")||t.includes("discussion")?"period-discussion":t.includes("rec")||t.includes("recitation")?"period-recitation":t.includes("sem")||t.includes("seminar")?"period-seminar":t.includes("studio")?"period-studio":t.includes("conference")||t.includes("conf")?"period-conference":"period-other"}getCourseFromElement(e){return this.elementToCourseMap.get(e)}extractTermLetter(e,t){if(t){const s=t.match(/^([ABCD])/i);if(s)return s[1].toUpperCase()}if(e){const s=e.match(/\b([ABCD])\s+Term/i);if(s)return s[1].toUpperCase()}return"A"}addSectionBlockEventListeners(e){e.addEventListener("click",t=>{const r=t.target.closest(".section-block");if(!r)return;const i=r.dataset.courseId,o=r.dataset.sectionNumber;i&&o&&(t.stopPropagation(),this.showSectionInfoModal(i,o))})}showSectionInfoModal(e,t){if(!this.sectionInfoModalController){console.warn("Section info modal controller not available");return}const r=this.courseSelectionService.getSelectedCourses().find(a=>a.course.id===e);if(!r||!r.selectedSection){console.warn("Course or section not found:",e,t);return}const i=r.course,o=r.selectedSection,n={courseCode:`${i.department.abbreviation}${i.number}`,courseName:i.name,section:o,course:i};this.sectionInfoModalController.show(n)}}class Ce{constructor(e){this.modalService=e}show(e){const t=this.modalService.generateId(),s=this.createModalElement(t,e);return this.modalService.showModal(t,s),this.modalService.setupModalBehavior(s,t),t}createModalElement(e,t){const s=document.createElement("div");s.className="modal-backdrop",s.id=e;const r=document.createElement("style");r.textContent=this.getModalCSS(),s.appendChild(r),s.innerHTML+=`
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
        `;const i=s.querySelector(".modal-dialog");return i&&i.addEventListener("click",o=>{o.stopPropagation()}),s}generateModalBody(e){const t=e.section.seatsAvailable>0?`${e.section.seatsAvailable} seats available`:"Full",s=e.section.maxWaitlist>0?`Waitlist: ${e.section.actualWaitlist}/${e.section.maxWaitlist}`:"",r=e.section.periods.map(i=>{const n=Array.from(i.days).sort().join(", ").toUpperCase(),a=`${i.startTime.displayTime} - ${i.endTime.displayTime}`,c=i.building&&i.room?`${i.building} ${i.room}`:i.location||"TBA";return`
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
        `}}class we{constructor(e){this.modalService=e}show(e,t,s="info"){const r=this.modalService.generateId(),i=this.createModalElement(r,e,t,s);return this.modalService.showModal(r,i),this.modalService.setupModalBehavior(i,r),r}showInfo(e,t){return this.show(e,t,"info")}showWarning(e,t){return this.show(e,t,"warning")}showError(e,t){return this.show(e,t,"error")}showSuccess(e,t){return this.show(e,t,"success")}createModalElement(e,t,s,r){const i=document.createElement("div");i.className="modal-backdrop",i.id=e;const o=document.createElement("style");o.textContent=this.getModalCSS(),i.appendChild(o),i.innerHTML+=`
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
        `}}class Te{constructor(e){this.filterService=null,this.allCourses=[],this.allDepartments=[],this.currentModalId=null,this.modalService=e}setFilterService(e){this.filterService=e}setCourseData(e){this.allDepartments=e,this.allCourses=[],e.forEach(t=>{this.allCourses.push(...t.courses)})}syncSearchInputFromMain(e){if(this.currentModalId){const t=document.getElementById(this.currentModalId);if(t){const s=t.querySelector(".search-text-input");s&&s.value!==e&&(s.value=e,this.updateClearSearchButton(t,e))}}}show(){if(!this.filterService)return console.error("FilterService not set on FilterModalController"),"";const e=this.modalService.generateId();this.currentModalId=e;const t=this.createModalElement(e);return this.modalService.showModal(e,t),this.modalService.setupModalBehavior(t,e,{closeOnBackdrop:!0,closeOnEscape:!0}),setTimeout(()=>this.initializeFilterUI(t),50),e}createModalElement(e){const t=document.createElement("div");t.className="modal-backdrop filter-modal",t.id=e;const s=this.filterService?.getFilterCount()||0,r=this.filterService?this.filterService.filterCourses(this.allCourses).length:this.allCourses.length;t.innerHTML=`
            <div class="modal-dialog filter-modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">
                            Filter Courses 
                            <span id="filter-count" class="filter-count">${s>0?`(${s})`:""}</span>
                        </h3>
                        <button class="modal-close" onclick="document.getElementById('${e}').click()">×</button>
                    </div>
                    <div class="modal-body filter-modal-body">
                        ${this.createFilterSections()}
                    </div>
                    <div class="modal-footer">
                        <div class="filter-preview">
                            <span id="course-count-preview">${r} courses match current filters</span>
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
        `}createSearchTextFilter(){if(!this.filterService)return"";const t=this.filterService.getActiveFilters().find(s=>s.id==="searchText")?.criteria?.query||"";return`
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
        `}createDepartmentFilter(){if(!this.filterService)return"";const e=this.filterService.getFilterOptions("department",this.allCourses),s=this.filterService.getActiveFilters().find(i=>i.id==="department")?.criteria?.departments||[];return`
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
                <input type="checkbox" value="${i}" ${s.includes(i)?"checked":""} 
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
                        <input type="checkbox" class="filter-toggle" data-filter="availability" ${this.filterService.getActiveFilters().find(s=>s.id==="availability")?.criteria?.availableOnly||!1?"checked":""}>
                        <span class="filter-toggle-slider"></span>
                        <span class="filter-toggle-text">Show only courses with available seats</span>
                    </label>
                </div>
            </div>
        `:""}createCreditRangeFilter(){if(!this.filterService)return"";const e=this.filterService.getActiveFilters().find(r=>r.id==="creditRange"),t=e?.criteria?.min||1,s=e?.criteria?.max||4;return`
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
                                <input type="number" min="1" max="4" value="${s}" 
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
                        ${(this.filterService.getActiveFilters().find(r=>r.id==="professor")?.criteria?.professors||[]).map(r=>`
            <span class="filter-chip">
                ${this.escapeHtml(r)}
                <button class="filter-chip-remove" data-professor="${this.escapeHtml(r)}">×</button>
            </span>
        `).join("")}
                    </div>
                </div>
            </div>
        `):""}createTermFilter(){if(!this.filterService)return"";const e=this.filterService.getFilterOptions("term",this.allCourses),s=this.filterService.getActiveFilters().find(i=>i.id==="term")?.criteria?.terms||[];return`
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Terms</h4>
                    <button class="filter-select-all" data-filter="term">All Terms</button>
                </div>
                <div class="filter-section-content">
                    <div class="filter-checkbox-row">
                        ${e.map(i=>`
            <label class="filter-checkbox-label term-checkbox">
                <input type="checkbox" value="${i}" ${s.includes(i)?"checked":""} 
                       data-filter="term">
                <span class="filter-checkbox-text">${i} Term</span>
            </label>
        `).join("")}
                    </div>
                </div>
            </div>
        `}createLocationFilter(){if(!this.filterService)return"";const t=this.filterService.getFilterOptions("location",this.allCourses).buildings||[],r=this.filterService.getActiveFilters().find(o=>o.id==="location")?.criteria?.buildings||[];return`
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
                <input type="checkbox" value="${o}" ${r.includes(o)?"checked":""} 
                       data-filter="location">
                <span class="filter-checkbox-text">${o}</span>
            </label>
        `).join("")}
                    </div>
                </div>
            </div>
        `}initializeFilterUI(e){this.filterService&&(this.setupSearchTextFilter(e),this.setupDepartmentFilter(e),this.setupAvailabilityFilter(e),this.setupCreditRangeFilter(e),this.setupProfessorFilter(e),this.setupTermFilter(e),this.setupLocationFilter(e),this.setupClearAllButton(e),this.setupFilterSearch(e))}setupSearchTextFilter(e){const t=e.querySelector(".search-text-input"),s=e.querySelector(".filter-clear-search");t&&t.addEventListener("input",()=>{const r=t.value.trim();this.updateSearchTextFilter(r,e),this.syncMainSearchInput(r)}),s&&s.addEventListener("click",()=>{t&&(t.value=""),this.updateSearchTextFilter("",e),this.syncMainSearchInput("")})}setupDepartmentFilter(e){const t=e.querySelectorAll('input[data-filter="department"]');t.forEach(i=>{i.addEventListener("change",()=>this.updateDepartmentFilter(e))});const s=e.querySelector('.filter-select-all[data-filter="department"]'),r=e.querySelector('.filter-select-none[data-filter="department"]');s?.addEventListener("click",()=>{t.forEach(i=>i.checked=!0),this.updateDepartmentFilter(e)}),r?.addEventListener("click",()=>{t.forEach(i=>i.checked=!1),this.updateDepartmentFilter(e)})}setupAvailabilityFilter(e){e.querySelector('input[data-filter="availability"]')?.addEventListener("change",()=>this.updateAvailabilityFilter(e))}setupCreditRangeFilter(e){const t=e.querySelector("#credit-min"),s=e.querySelector("#credit-max"),r=e.querySelectorAll(".filter-quick-btn");t?.addEventListener("change",()=>this.updateCreditRangeFilter(e)),s?.addEventListener("change",()=>this.updateCreditRangeFilter(e)),r.forEach(i=>{i.addEventListener("click",o=>{const n=o.target.dataset.credits;if(n?.includes("-")){const[a,c]=n.split("-");t&&(t.value=a),s&&(s.value=c)}else t&&(t.value=n),s&&(s.value=n);this.updateCreditRangeFilter(e)})})}setupProfessorFilter(e){const t=e.querySelector(".professor-search"),s=e.querySelector("#professor-dropdown");if(t&&this.filterService){const i=this.filterService.getFilterOptions("professor",this.allCourses);t.addEventListener("input",()=>{const o=t.value.toLowerCase();if(o.length>0){const n=i.filter(a=>a.toLowerCase().includes(o)&&a!=="TBA").slice(0,10);s.innerHTML=n.map(a=>`<div class="professor-option" data-professor="${a}">${a}</div>`).join(""),s.style.display=n.length>0?"block":"none"}else s.style.display="none"}),document.addEventListener("click",o=>{!t.contains(o.target)&&!s.contains(o.target)&&(s.style.display="none")}),s.addEventListener("click",o=>{const n=o.target;if(n.classList.contains("professor-option")){const a=n.dataset.professor;this.addProfessorFilter(a,e),t.value="",s.style.display="none"}})}const r=e.querySelector(".filter-selected-chips");r&&r.addEventListener("click",i=>{const o=i.target;if(o.classList.contains("filter-chip-remove")){i.stopPropagation(),i.preventDefault();const n=this.unescapeHtml(o.dataset.professor);this.removeProfessorFilter(n,e)}})}setupTermFilter(e){const t=e.querySelectorAll('input[data-filter="term"]');t.forEach(r=>{r.addEventListener("change",()=>this.updateTermFilter(e))}),e.querySelector('.filter-select-all[data-filter="term"]')?.addEventListener("click",()=>{t.forEach(r=>r.checked=!0),this.updateTermFilter(e)})}setupLocationFilter(e){const t=e.querySelectorAll('input[data-filter="location"]');t.forEach(i=>{i.addEventListener("change",()=>this.updateLocationFilter(e))});const s=e.querySelector('.filter-select-all[data-filter="location"]'),r=e.querySelector('.filter-select-none[data-filter="location"]');s?.addEventListener("click",()=>{t.forEach(i=>i.checked=!0),this.updateLocationFilter(e)}),r?.addEventListener("click",()=>{t.forEach(i=>i.checked=!1),this.updateLocationFilter(e)})}setupClearAllButton(e){e.querySelector("#clear-all-filters")?.addEventListener("click",()=>{if(this.filterService){this.filterService.clearFilters(),this.updatePreview(e),this.syncMainSearchInput("");const s=e.querySelector(".filter-modal-body");s&&(s.innerHTML=this.createFilterSections(),this.initializeFilterUI(e))}})}setupFilterSearch(e){e.querySelectorAll(".filter-search").forEach(s=>{s.addEventListener("input",r=>{const i=r.target,o=i.dataset.filter,n=i.value.toLowerCase();if(o==="department"){const a=e.querySelector("#department-checkboxes");a&&a.querySelectorAll(".filter-checkbox-label").forEach(l=>{const h=l.textContent.toLowerCase();l.style.display=h.includes(n)?"flex":"none"})}else if(o==="location"){const a=e.querySelector("#location-checkboxes");a&&a.querySelectorAll(".filter-checkbox-label").forEach(l=>{const h=l.textContent.toLowerCase();l.style.display=h.includes(n)?"flex":"none"})}})})}updateSearchTextFilter(e,t){e.length>0?this.filterService?.addFilter("searchText",{query:e}):this.filterService?.removeFilter("searchText"),this.updatePreview(t),this.updateClearSearchButton(t,e)}syncMainSearchInput(e){const t=document.getElementById("search-input");t&&(t.value=e)}updateClearSearchButton(e,t){const s=e.querySelector(".filter-clear-search");s&&(s.style.display=t.length>0?"inline-block":"none")}updateDepartmentFilter(e){const t=e.querySelectorAll('input[data-filter="department"]:checked'),s=Array.from(t).map(r=>r.value);s.length>0?this.filterService?.addFilter("department",{departments:s}):this.filterService?.removeFilter("department"),this.updatePreview(e)}updateAvailabilityFilter(e){e.querySelector('input[data-filter="availability"]').checked?this.filterService?.addFilter("availability",{availableOnly:!0}):this.filterService?.removeFilter("availability"),this.updatePreview(e)}updateCreditRangeFilter(e){const t=e.querySelector("#credit-min"),s=e.querySelector("#credit-max"),r=parseInt(t.value),i=parseInt(s.value);r&&i&&(r!==1||i!==4)?this.filterService?.addFilter("creditRange",{min:r,max:i}):this.filterService?.removeFilter("creditRange"),this.updatePreview(e)}addProfessorFilter(e,t){if(!this.filterService)return;const r=this.filterService.getActiveFilters().find(i=>i.id==="professor")?.criteria?.professors||[];if(!r.includes(e)){const i=[...r,e];this.filterService.addFilter("professor",{professors:i}),this.refreshProfessorChips(t),this.updatePreview(t)}}removeProfessorFilter(e,t){if(!this.filterService)return;const i=(this.filterService.getActiveFilters().find(o=>o.id==="professor")?.criteria?.professors||[]).filter(o=>o!==e);i.length>0?this.filterService.addFilter("professor",{professors:i}):this.filterService.removeFilter("professor"),this.refreshProfessorChips(t),this.updatePreview(t)}refreshProfessorChips(e){if(!this.filterService)return;const s=this.filterService.getActiveFilters().find(i=>i.id==="professor")?.criteria?.professors||[],r=e.querySelector(".filter-selected-chips");r&&(r.innerHTML=s.map(i=>`
                <span class="filter-chip">
                    ${this.escapeHtml(i)}
                    <button class="filter-chip-remove" data-professor="${this.escapeHtml(i)}">×</button>
                </span>
            `).join(""))}updateTermFilter(e){const t=e.querySelectorAll('input[data-filter="term"]:checked'),s=Array.from(t).map(r=>r.value);s.length>0?this.filterService?.addFilter("term",{terms:s}):this.filterService?.removeFilter("term"),this.updatePreview(e)}updateLocationFilter(e){const t=e.querySelectorAll('input[data-filter="location"]:checked'),s=Array.from(t).map(r=>r.value);s.length>0?this.filterService?.addFilter("location",{buildings:s}):this.filterService?.removeFilter("location"),this.updatePreview(e)}updatePreview(e){if(!this.filterService)return;const s=this.filterService.filterCourses(this.allCourses).length,r=this.filterService.getFilterCount(),i=e.querySelector("#course-count-preview"),o=e.querySelector("#filter-count");i&&(i.textContent=`${s} courses match current filters`),o&&(o.textContent=r>0?`(${r})`:"")}escapeHtml(e){const t=document.createElement("div");return t.textContent=e,t.innerHTML}unescapeHtml(e){const t=document.createElement("div");return t.innerHTML=e,t.textContent||t.innerText||""}}class Ee{constructor(){this.activeFilters=new Map,this.listeners=[]}addFilter(e,t,s,r){const i={id:e,name:t,criteria:s,displayValue:r};this.activeFilters.set(e,i),this.notifyListeners({type:"add",filterId:e,criteria:s,activeFilters:this.getActiveFilters()})}removeFilter(e){const t=this.activeFilters.delete(e);return t&&this.notifyListeners({type:"remove",filterId:e,activeFilters:this.getActiveFilters()}),t}updateFilter(e,t,s){const r=this.activeFilters.get(e);return r?(r.criteria=t,r.displayValue=s,this.notifyListeners({type:"update",filterId:e,criteria:t,activeFilters:this.getActiveFilters()}),!0):!1}clearFilters(){this.activeFilters.clear(),this.notifyListeners({type:"clear",activeFilters:[]})}hasFilter(e){return this.activeFilters.has(e)}getFilter(e){return this.activeFilters.get(e)}getActiveFilters(){return Array.from(this.activeFilters.values())}getFilterCriteria(){const e={};for(const[t,s]of this.activeFilters)e[t]=s.criteria;return e}getActiveFilterIds(){return Array.from(this.activeFilters.keys())}getFilterCount(){return this.activeFilters.size}isEmpty(){return this.activeFilters.size===0}addEventListener(e){this.listeners.push(e)}removeEventListener(e){const t=this.listeners.indexOf(e);t>-1&&this.listeners.splice(t,1)}notifyListeners(e){this.listeners.forEach(t=>{try{t(e)}catch(s){console.error("Error in filter event listener:",s)}})}serialize(){const e={filters:Array.from(this.activeFilters.entries()).map(([t,s])=>({id:s.id,name:s.name,criteria:s.criteria,displayValue:s.displayValue}))};return JSON.stringify(e)}deserialize(e){try{const t=JSON.parse(e);return this.activeFilters.clear(),t.filters&&Array.isArray(t.filters)&&t.filters.forEach(s=>{this.activeFilters.set(s.id,s)}),this.notifyListeners({type:"clear",activeFilters:this.getActiveFilters()}),!0}catch(t){return console.error("Failed to deserialize filter state:",t),!1}}}class xe{constructor(e){this.registeredFilters=new Map,this.filterState=new Ee,this.searchService=e}registerFilter(e){this.registeredFilters.set(e.id,e)}unregisterFilter(e){const t=this.registeredFilters.delete(e);return t&&this.removeFilter(e),t}getRegisteredFilter(e){return this.registeredFilters.get(e)}getAvailableFilters(){return Array.from(this.registeredFilters.values())}addFilter(e,t){const s=this.registeredFilters.get(e);if(!s)return console.error(`Filter '${e}' is not registered`),!1;if(!s.isValidCriteria(t))return console.error(`Invalid criteria for filter '${e}'`),!1;const r=s.getDisplayValue(t);return this.filterState.addFilter(e,s.name,t,r),!0}updateFilter(e,t){const s=this.registeredFilters.get(e);if(!s||!s.isValidCriteria(t))return!1;const r=s.getDisplayValue(t);return this.filterState.updateFilter(e,t,r)}removeFilter(e){return this.filterState.removeFilter(e)}clearFilters(){this.filterState.clearFilters()}toggleFilter(e,t){return this.hasFilter(e)?this.removeFilter(e):this.addFilter(e,t)}hasFilter(e){return this.filterState.hasFilter(e)}getActiveFilters(){return this.filterState.getActiveFilters()}getFilterCount(){return this.filterState.getFilterCount()}isEmpty(){return this.filterState.isEmpty()}filterCourses(e){if(this.isEmpty())return e;let t=e;const s=this.getActiveFilters(),r=s.find(i=>i.id==="searchText");if(r){const i=this.registeredFilters.get(r.id);i&&(t=i.apply(t,r.criteria))}for(const i of s)if(i.id!=="searchText"){const o=this.registeredFilters.get(i.id);o&&(t=o.apply(t,i.criteria))}return t}searchAndFilter(e,t){return e.trim()?this.addFilter("searchText",{query:e.trim()}):this.removeFilter("searchText"),this.filterCourses(t)}addEventListener(e){this.filterState.addEventListener(e)}removeEventListener(e){this.filterState.removeEventListener(e)}saveFiltersToStorage(){const e=this.filterState.serialize();localStorage.setItem("wpi-course-filters",e)}loadFiltersFromStorage(){const e=localStorage.getItem("wpi-course-filters");return e?this.filterState.deserialize(e):!1}getFilterSummary(){const e=this.getActiveFilters();return e.length===0?"No filters active":e.length===1?`1 filter: ${e[0].displayValue}`:`${e.length} filters active`}convertToSearchFilter(){const e=this.filterState.getFilterCriteria();return{departments:e.department?.departments||[],timeSlots:e.timeSlot?.timeSlots||[],professors:e.professor?.professors||[],availabilityOnly:e.availability?.availableOnly||!1,creditRange:e.creditRange?{min:e.creditRange.min,max:e.creditRange.max}:void 0}}getFilterOptions(e,t){switch(e){case"department":return this.getDepartmentOptions(t);case"professor":return this.getProfessorOptions(t);case"location":return this.getLocationOptions(t);case"term":return this.getTermOptions(t);default:return null}}getDepartmentOptions(e){const t=new Set;return e.forEach(s=>t.add(s.department.abbreviation)),Array.from(t).sort()}getProfessorOptions(e){return this.searchService.getAvailableProfessors()}getLocationOptions(e){return{buildings:this.searchService.getAvailableBuildings(),rooms:[]}}getTermOptions(e){const t=new Set;return e.forEach(s=>{s.sections.forEach(r=>{r.term&&t.add(r.term)})}),Array.from(t).sort()}}class $e{constructor(){this.courses=[],this.departments=[],this.searchIndex=new Map,this.professorCache=null,this.buildingCache=null,this.timeSlotMappings=new Map}setCourseData(e){this.departments=e,this.courses=[];for(const t of e)this.courses.push(...t.courses);this.clearCaches(),this.buildSearchIndex(),this.buildTimeSlotMappings()}searchCourses(e,t){let s=this.courses;return e.trim()&&(s=this.performTextSearch(s,e.trim())),t&&(s=this.applyFilters(s,t)),this.rankResults(s,e)}performTextSearch(e,t){const s=t.toLowerCase(),r=this.searchFromIndex(s);return r.length>0?e.filter(i=>r.includes(i)):e.filter(i=>{const o=[i.id,i.name,i.description,i.department.abbreviation,i.department.name,i.number].join(" ").toLowerCase();return this.fuzzyMatch(o,s)})}applyFilters(e,t){return e.filter(s=>{if(t.departments.length>0&&!t.departments.includes(s.department.abbreviation.toLowerCase()))return!1;if(t.creditRange){const{min:r,max:i}=t.creditRange;if(s.maxCredits<r||s.minCredits>i)return!1}return!(t.availabilityOnly&&!s.sections.some(i=>i.seatsAvailable>0)||t.timeSlots.length>0&&!s.sections.some(i=>i.periods.some(o=>t.timeSlots.some(n=>this.periodsOverlap(o,n))))||t.professors.length>0&&!s.sections.some(i=>i.periods.some(o=>t.professors.some(n=>o.professor.toLowerCase().includes(n.toLowerCase())))))})}periodsOverlap(e,t){const s=e.startTime.hours*60+e.startTime.minutes,r=e.endTime.hours*60+e.endTime.minutes,i=t.startTime.hours*60+t.startTime.minutes,o=t.endTime.hours*60+t.endTime.minutes,n=s<o&&i<r,a=t.days.some(c=>e.days.has(c));return n&&a}rankResults(e,t){if(!t.trim())return e;const s=t.toLowerCase();return e.sort((r,i)=>{const o=this.calculateRelevanceScore(r,s);return this.calculateRelevanceScore(i,s)-o})}calculateRelevanceScore(e,t){let s=0;e.id.toLowerCase()===t&&(s+=100),e.name.toLowerCase()===t&&(s+=90),e.id.toLowerCase().startsWith(t)&&(s+=80),e.name.toLowerCase().startsWith(t)&&(s+=70),e.department.abbreviation.toLowerCase().startsWith(t)&&(s+=60),e.id.toLowerCase().includes(t)&&(s+=40),e.name.toLowerCase().includes(t)&&(s+=30),e.description.toLowerCase().includes(t)&&(s+=10);const r=e.sections.reduce((o,n)=>o+n.seats,0);return e.sections.reduce((o,n)=>o+n.seatsAvailable,0)>0&&(s+=5),r>100&&(s+=2),s}getDepartments(){return this.departments}getCoursesByDepartment(e){const t=this.departments.find(s=>s.abbreviation.toLowerCase()===e.toLowerCase());return t?t.courses:[]}getAvailableProfessors(){if(this.professorCache)return this.professorCache;const e=new Set;return this.courses.forEach(t=>{t.sections.forEach(s=>{s.periods.forEach(r=>{r.professor&&r.professor!=="TBA"&&e.add(r.professor)})})}),this.professorCache=Array.from(e).sort(),this.professorCache}getAvailableBuildings(){if(this.buildingCache)return this.buildingCache;const e=new Set;return this.courses.forEach(t=>{t.sections.forEach(s=>{s.periods.forEach(r=>{r.building&&e.add(r.building)})})}),this.buildingCache=Array.from(e).sort(),this.buildingCache}clearCaches(){this.professorCache=null,this.buildingCache=null,this.searchIndex.clear(),this.timeSlotMappings.clear()}buildSearchIndex(){this.courses.forEach(e=>{this.extractKeywords(e).forEach(s=>{this.searchIndex.has(s)||this.searchIndex.set(s,new Set),this.searchIndex.get(s).add(e)})})}extractKeywords(e){const t=[e.id.toLowerCase(),e.name.toLowerCase(),e.number.toLowerCase(),e.department.abbreviation.toLowerCase(),e.department.name.toLowerCase(),...e.description.toLowerCase().split(/\s+/)];return t.forEach(s=>{if(s.length>3)for(let r=0;r<s.length-2;r++)t.push(s.substring(r,r+3))}),t.filter(s=>s.length>1)}searchFromIndex(e){const t=new Set;this.searchIndex.has(e)&&this.searchIndex.get(e).forEach(s=>t.add(s));for(const[s,r]of this.searchIndex.entries())(s.includes(e)||e.includes(s))&&r.forEach(i=>t.add(i));return Array.from(t)}fuzzyMatch(e,t){return e.includes(t)?!0:t.length<=3?e.includes(t):t.split(/\s+/).every(r=>{if(r.length<=2)return e.includes(r);const i=r.substring(0,Math.floor(r.length*.8));return e.includes(i)})}buildTimeSlotMappings(){this.courses.forEach(e=>{e.sections.forEach(t=>{t.periods.forEach(s=>{const r=this.getTimeSlotKey(s);this.timeSlotMappings.has(r)||this.timeSlotMappings.set(r,[]),this.timeSlotMappings.get(r).includes(e)||this.timeSlotMappings.get(r).push(e)})})})}getTimeSlotKey(e){const t=e.startTime.hours*60+e.startTime.minutes,s=e.endTime.hours*60+e.endTime.minutes;return`${Array.from(e.days).sort().join("")}-${t}-${s}`}getCreditRanges(){return[{min:1,max:1,label:"1 Credit"},{min:2,max:2,label:"2 Credits"},{min:3,max:3,label:"3 Credits"},{min:4,max:4,label:"4 Credits"},{min:1,max:2,label:"1-2 Credits"},{min:3,max:4,label:"3-4 Credits"},{min:1,max:4,label:"Any Credits"}]}}class Ae{constructor(){this.id="department",this.name="Department",this.description="Filter courses by department(s)"}apply(e,t){if(!t.departments||t.departments.length===0)return e;const s=new Set(t.departments.map(r=>r.toLowerCase()));return e.filter(r=>s.has(r.department.abbreviation.toLowerCase()))}isValidCriteria(e){return e&&Array.isArray(e.departments)&&e.departments.every(t=>typeof t=="string")}getDisplayValue(e){return e.departments.length===1?`Department: ${e.departments[0]}`:`Departments: ${e.departments.join(", ")}`}}class Fe{constructor(){this.id="availability",this.name="Availability",this.description="Show only courses with available seats"}apply(e,t){return t.availableOnly?e.filter(s=>s.sections.some(r=>r.seatsAvailable>0)):e}isValidCriteria(e){return e&&typeof e.availableOnly=="boolean"}getDisplayValue(e){return e.availableOnly?"Available seats only":"All courses"}}class Le{constructor(){this.id="creditRange",this.name="Credit Range",this.description="Filter courses by credit hours"}apply(e,t){return e.filter(s=>s.maxCredits>=t.min&&s.minCredits<=t.max)}isValidCriteria(e){return e&&typeof e.min=="number"&&typeof e.max=="number"&&e.min>=0&&e.max>=e.min}getDisplayValue(e){return e.min===e.max?`${e.min} credit${e.min===1?"":"s"}`:`${e.min}-${e.max} credits`}}class Me{constructor(){this.id="professor",this.name="Professor",this.description="Filter courses by instructor"}apply(e,t){if(!t.professors||t.professors.length===0)return e;const s=new Set(t.professors.map(r=>r.toLowerCase()));return e.filter(r=>r.sections.some(i=>i.periods.some(o=>s.has(o.professor.toLowerCase()))))}isValidCriteria(e){return e&&Array.isArray(e.professors)&&e.professors.every(t=>typeof t=="string")}getDisplayValue(e){return e.professors.length===1?`Professor: ${e.professors[0]}`:e.professors.length<=3?`Professors: ${e.professors.join(", ")}`:`Professors: ${e.professors.slice(0,2).join(", ")}, +${e.professors.length-2} more`}}class De{constructor(){this.id="term",this.name="Term",this.description="Filter courses by academic term"}apply(e,t){if(!t.terms||t.terms.length===0)return e;const s=new Set(t.terms.map(r=>r.toLowerCase()));return e.filter(r=>r.sections.some(i=>i.term&&s.has(i.term.toLowerCase())))}isValidCriteria(e){return e&&Array.isArray(e.terms)&&e.terms.every(t=>typeof t=="string")}getDisplayValue(e){return e.terms.length===1?`Term: ${e.terms[0]}`:`Terms: ${e.terms.join(", ")}`}}class Ie{constructor(){this.id="location",this.name="Location",this.description="Filter courses by building or room"}apply(e,t){const s=t.buildings&&t.buildings.length>0,r=t.rooms&&t.rooms.length>0;if(!s&&!r)return e;const i=s?new Set(t.buildings.map(n=>n.toLowerCase())):null,o=r?new Set(t.rooms.map(n=>n.toLowerCase())):null;return e.filter(n=>n.sections.some(a=>a.periods.some(c=>!(i&&!i.has(c.building.toLowerCase())||o&&!o.has(c.room.toLowerCase())))))}isValidCriteria(e){return e&&(Array.isArray(e.buildings)||Array.isArray(e.rooms))&&(!e.buildings||e.buildings.every(t=>typeof t=="string"))&&(!e.rooms||e.rooms.every(t=>typeof t=="string"))}getDisplayValue(e){const t=[];return e.buildings&&e.buildings.length>0&&(e.buildings.length===1?t.push(`Building: ${e.buildings[0]}`):t.push(`Buildings: ${e.buildings.join(", ")}`)),e.rooms&&e.rooms.length>0&&(e.rooms.length===1?t.push(`Room: ${e.rooms[0]}`):t.push(`Rooms: ${e.rooms.join(", ")}`)),t.join("; ")}}class ke{constructor(){this.id="searchText",this.name="Search Text",this.description="Filter courses by search text"}apply(e,t){if(!t.query||!t.query.trim())return e;const s=t.query.trim().toLowerCase();return e.filter(r=>{const i=[r.id,r.name,r.description,r.department.abbreviation,r.department.name,r.number].join(" ").toLowerCase();return i.includes(s)||this.fuzzyMatch(i,s)})}fuzzyMatch(e,t){return t.length<=3?e.includes(t):t.split(/\s+/).every(r=>{if(r.length<=2)return e.includes(r);const i=r.substring(0,Math.floor(r.length*.8));return e.includes(i)})}isValidCriteria(e){return e&&typeof e=="object"&&"query"in e&&typeof e.query=="string"}getDisplayValue(e){return`"${e.query.trim()}"`}}const Oe=()=>[new Ae,new Fe,new Le,new Me,new De,new Ie];class Re{constructor(){this.currentView="list",this.currentPage="planner"}setView(e){this.currentView=e;const t=document.getElementById("view-list"),s=document.getElementById("view-grid");t&&s&&(e==="list"?(t.classList.add("btn-primary","active"),t.classList.remove("btn-secondary"),s.classList.add("btn-secondary"),s.classList.remove("btn-primary","active")):(s.classList.add("btn-primary","active"),s.classList.remove("btn-secondary"),t.classList.add("btn-secondary"),t.classList.remove("btn-primary","active")))}togglePage(){const e=this.currentPage==="planner"?"schedule":"planner";this.switchToPage(e)}switchToPage(e){if(e===this.currentPage)return;this.currentPage=e;const t=document.getElementById("schedule-btn");t&&(e==="schedule"?(t.textContent="Back to Classes",this.showSchedulePage()):(t.textContent="Schedule",this.showPlannerPage()))}showPlannerPage(){const e=document.getElementById("planner-page"),t=document.getElementById("schedule-page");e&&(e.style.display="grid"),t&&(t.style.display="none")}showSchedulePage(){const e=document.getElementById("planner-page"),t=document.getElementById("schedule-page");e&&(e.style.display="none"),t&&(t.style.display="flex")}showLoadingState(){const e=document.getElementById("department-list");e&&(e.innerHTML='<div class="loading-message">Loading departments...</div>')}showErrorMessage(e){const t=document.getElementById("department-list");t&&(t.innerHTML=`<div class="error-message">${e}</div>`);const s=document.getElementById("course-container");s&&(s.innerHTML=`<div class="error-message">${e}</div>`)}syncHeaderHeights(){const e=document.querySelector(".sidebar-header"),t=document.querySelector(".content-header"),s=document.querySelectorAll(".panel-header");!e||!t||!s.length||(document.documentElement.style.setProperty("--synced-header-height","auto"),requestAnimationFrame(()=>{const r=e.offsetHeight,i=t.offsetHeight,o=Array.from(s).map(a=>a.offsetHeight),n=Math.max(r,i,...o);document.documentElement.style.setProperty("--synced-header-height",`${n}px`)}))}setupHeaderResizeObserver(){if(!window.ResizeObserver)return;const e=[document.querySelector(".sidebar-header"),document.querySelector(".content-header"),...document.querySelectorAll(".panel-header")].filter(Boolean);if(!e.length)return;const t=new ResizeObserver(()=>{this.syncHeaderHeights()});e.forEach(s=>{t.observe(s)})}}class Pe{constructor(){}updateClientTimestamp(){const e=document.getElementById("client-timestamp");if(e){const t=new Date,s={month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",second:"2-digit",hour12:!0},r=t.toLocaleDateString("en-US",s).replace(","," at");e.textContent=`Client loaded: ${r}`}}async loadServerTimestamp(){const e=document.getElementById("server-timestamp");if(e)try{const t=await fetch("./last-updated.json",{cache:"no-cache"});if(t.ok){const s=await t.json(),r=new Date(s.timestamp),i={month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",second:"2-digit",hour12:!0},o=r.toLocaleDateString("en-US",i).replace(","," at");e.textContent=`Server updated: ${o}`}else throw new Error(`Failed to fetch server timestamp: ${t.status}`)}catch(t){console.warn("Failed to load server timestamp:",t),e.textContent="Server timestamp unavailable"}}}class Be{constructor(){this.allDepartments=[],this.previousSelectedCoursesCount=0,this.previousSelectedCoursesMap=new Map,this.courseDataService=new k,this.themeSelector=new me,this.courseSelectionService=new pe,this.conflictDetector=new ge,this.modalService=new ve,this.departmentController=new Se,this.searchService=new $e,this.filterService=new xe(this.searchService),this.courseController=new ye(this.courseSelectionService),this.scheduleController=new be(this.courseSelectionService),this.sectionInfoModalController=new Ce(this.modalService),this.infoModalController=new we(this.modalService),this.filterModalController=new Te(this.modalService),this.initializeFilters(),this.courseController.setFilterService(this.filterService),this.filterModalController.setFilterService(this.filterService),this.scheduleController.setSectionInfoModalController(this.sectionInfoModalController),this.uiStateManager=new Re,this.timestampManager=new Pe,this.scheduleController.setStatePreserver({preserve:()=>this.preserveDropdownStates(),restore:t=>this.restoreDropdownStates(t)});const e=this.courseSelectionService.getSelectedCourses();this.previousSelectedCoursesCount=e.length,this.previousSelectedCoursesMap=new Map,e.forEach(t=>{this.previousSelectedCoursesMap.set(t.course.id,t.selectedSectionNumber)}),this.init()}initializeFilters(){Oe().forEach(s=>{this.filterService.registerFilter(s)});const t=new ke;this.filterService.registerFilter(t),this.filterService.addEventListener(s=>{this.refreshCurrentView()}),this.filterService.loadFiltersFromStorage(),setTimeout(()=>this.updateFilterButtonState(),100)}async init(){this.uiStateManager.showLoadingState(),await this.loadCourseData(),this.departmentController.displayDepartments(),this.setupEventListeners(),this.setupCourseSelectionListener(),this.courseController.displaySelectedCourses(),this.uiStateManager.syncHeaderHeights(),this.uiStateManager.setupHeaderResizeObserver()}async loadCourseData(){try{console.log("Loading course data...");const e=await this.courseDataService.loadCourseData();this.allDepartments=e.departments,this.departmentController.setAllDepartments(this.allDepartments),this.courseController.setAllDepartments(this.allDepartments),this.courseSelectionService.setAllDepartments(this.allDepartments),this.searchService.setCourseData(this.allDepartments),this.filterModalController.setCourseData(this.allDepartments),console.log(`Loaded ${this.allDepartments.length} departments`),console.log("Reconstructing section objects for persisted selections..."),this.courseSelectionService.reconstructSectionObjects(),this.timestampManager.updateClientTimestamp(),this.timestampManager.loadServerTimestamp()}catch(e){console.error("Failed to load course data:",e),this.uiStateManager.showErrorMessage("Failed to load course data. Please try refreshing the page.")}}setupEventListeners(){document.addEventListener("click",n=>{const a=n.target;if(a.classList.contains("department-item")){const c=a.dataset.deptId;if(c){const l=this.departmentController.handleDepartmentClick(c);l&&this.courseController.displayCourses(l.courses,this.uiStateManager.currentView)}}if(a.classList.contains("section-badge")&&a.classList.toggle("selected"),a.classList.contains("course-select-btn")){const c=a.closest(".course-item, .course-card");c&&this.courseController.toggleCourseSelection(c)}if(a.classList.contains("course-remove-btn")){const c=this.courseController.getCourseFromElement(a);c&&this.courseSelectionService.unselectCourse(c)}if(a.classList.contains("section-select-btn")){n.stopPropagation();const c=a.closest(".schedule-course-item"),l=a.dataset.section;if(c&&l){const h=this.scheduleController.getCourseFromElement(c);h&&this.scheduleController.handleSectionSelection(h,l)}return}if(a.classList.contains("section-option")||a.closest(".section-option")||a.classList.contains("section-info")||a.closest(".section-info")||a.classList.contains("section-number")||a.classList.contains("section-schedule")||a.classList.contains("section-professor")){n.stopPropagation(),n.preventDefault();return}if(a.classList.contains("dropdown-trigger")||a.closest(".dropdown-trigger")){const c=a.classList.contains("dropdown-trigger")?a:a.closest(".dropdown-trigger");c&&!a.classList.contains("course-remove-btn")&&!a.classList.contains("section-select-btn")&&!a.classList.contains("section-number")&&!a.classList.contains("section-schedule")&&!a.classList.contains("section-professor")&&!a.closest(".section-option")&&!a.closest(".section-info")&&!a.closest(".schedule-sections-container")&&this.toggleCourseDropdown(c)}if(a.closest(".course-item, .course-card")&&!a.classList.contains("course-select-btn")&&!a.classList.contains("section-badge")){const c=a.closest(".course-item, .course-card");c&&this.courseController.selectCourse(c)}});const e=document.getElementById("search-input");e&&e.addEventListener("input",()=>{const n=e.value.trim();n.length>0?this.filterService.addFilter("searchText",{query:n}):this.filterService.removeFilter("searchText"),this.syncModalSearchInput(n)});const t=document.getElementById("clear-selection");t&&t.addEventListener("click",()=>{this.clearSelection()});const s=document.getElementById("schedule-btn");s&&s.addEventListener("click",()=>{if(this.uiStateManager.togglePage(),this.uiStateManager.currentPage==="schedule"){const n=this.courseSelectionService.getSelectedCourses();console.log("=== SCHEDULE PAGE LOADED ==="),console.log(`Found ${n.length} selected courses with sections:`),n.forEach(a=>{const c=a.selectedSection!==null;console.log(`${a.course.department.abbreviation}${a.course.number}: section ${a.selectedSectionNumber} ${c?"✓":"✗"}`),c&&a.selectedSection&&(console.log(`  Term: ${a.selectedSection.term}, Periods: ${a.selectedSection.periods.length}`),console.log("  Full section object:",a.selectedSection),a.selectedSection.periods.forEach((l,h)=>{console.log(`    Period ${h+1}:`,{type:l.type,professor:l.professor,startTime:l.startTime,endTime:l.endTime,days:Array.from(l.days),location:l.location,building:l.building,room:l.room});const f=Math.floor((l.startTime.hours*60+l.startTime.minutes-7*60)/10),p=Math.floor((l.endTime.hours*60+l.endTime.minutes-7*60)/10),x=p-f;console.log(`      Time slots: ${f} to ${p} (span ${x} rows)`)}))}),console.log(`=== END SCHEDULE SECTION DATA ===
`),this.scheduleController.displayScheduleSelectedCourses(),this.scheduleController.renderScheduleGrids()}});const r=document.getElementById("view-list"),i=document.getElementById("view-grid");r&&r.addEventListener("click",()=>{this.uiStateManager.setView("list"),this.refreshCurrentView()}),i&&i.addEventListener("click",()=>{this.uiStateManager.setView("grid"),this.refreshCurrentView()});const o=document.getElementById("filter-btn");o&&o.addEventListener("click",()=>{this.filterModalController.show()})}refreshCurrentView(){const e=this.departmentController.getSelectedDepartment(),t=!this.filterService.isEmpty();let s=[];if(t){const r=e?e.courses:this.getAllCourses();s=this.filterService.filterCourses(r),this.updateFilteredHeader(s.length,e)}else e?(s=e.courses,this.updateDepartmentHeader(e)):(s=[],this.updateDefaultHeader());this.courseController.displayCourses(s,this.uiStateManager.currentView),t&&this.filterService.saveFiltersToStorage(),this.updateFilterButtonState(),this.syncSearchInputFromFilters()}updateFilterButtonState(){const e=document.getElementById("filter-btn");if(e&&this.filterService){const t=!this.filterService.isEmpty(),s=this.filterService.getFilterCount();t?(e.classList.add("active"),e.title=`${s} filter${s===1?"":"s"} active - Click to modify`):(e.classList.remove("active"),e.title="Filter courses")}}clearSelection(){document.querySelectorAll(".section-badge.selected").forEach(r=>{r.classList.remove("selected")});const e=document.getElementById("search-input");e&&(e.value="");const t=document.getElementById("course-container");t&&(t.innerHTML='<div class="loading-message">Select a department to view courses...</div>');const s=document.querySelector(".content-header h2");s&&(s.textContent="Course Listings"),this.departmentController.clearDepartmentSelection(),this.courseController.clearCourseSelection(),this.courseController.displaySelectedCourses()}setupCourseSelectionListener(){this.courseSelectionService.onSelectionChange(e=>{const t=e.length,s=t!==this.previousSelectedCoursesCount,r=new Map;if(e.forEach(i=>{r.set(i.course.id,i.selectedSectionNumber)}),this.courseController.refreshCourseSelectionUI(),this.courseController.displaySelectedCourses(),s)this.scheduleController.displayScheduleSelectedCourses();else{let i=!1;for(const[o,n]of r)if(this.previousSelectedCoursesMap.get(o)!==n){i=!0;const c=e.find(l=>l.course.id===o);c&&this.scheduleController.updateSectionButtonStates(c.course,n)}i&&this.uiStateManager.currentPage==="schedule"&&this.scheduleController.renderScheduleGrids()}this.previousSelectedCoursesCount=t,this.previousSelectedCoursesMap=new Map(r)})}getSelectedCourses(){return this.courseSelectionService.getSelectedCourses()}getSelectedCoursesCount(){return this.courseSelectionService.getSelectedCoursesCount()}getCourseSelectionService(){return this.courseSelectionService}getFilterService(){return this.filterService}getModalService(){return this.modalService}getSectionInfoModalController(){return this.sectionInfoModalController}getInfoModalController(){return this.infoModalController}toggleCourseDropdown(e){const t=e.closest(".schedule-course-item");if(!t)return;t.classList.contains("collapsed")?(t.classList.remove("collapsed"),t.classList.add("expanded")):(t.classList.remove("expanded"),t.classList.add("collapsed"))}preserveDropdownStates(){const e=new Map;return document.querySelectorAll(".schedule-course-item").forEach(t=>{const s=this.scheduleController.getCourseFromElement(t);if(s){const r=t.classList.contains("expanded");e.set(s.id,r)}}),e}restoreDropdownStates(e){document.querySelectorAll(".schedule-course-item").forEach(t=>{const s=this.scheduleController.getCourseFromElement(t);s&&e.has(s.id)&&(e.get(s.id)?(t.classList.remove("collapsed"),t.classList.add("expanded")):(t.classList.remove("expanded"),t.classList.add("collapsed")))})}getAllCourses(){const e=[];return this.allDepartments.forEach(t=>{e.push(...t.courses)}),e}syncModalSearchInput(e){this.filterModalController.syncSearchInputFromMain(e)}syncSearchInputFromFilters(){const e=document.getElementById("search-input");if(e){const s=this.filterService.getActiveFilters().find(r=>r.id==="searchText")?.criteria?.query||"";e.value!==s&&(e.value=s)}}updateFilteredHeader(e,t){const s=document.querySelector(".content-header h2");if(s){const r=this.filterService.getActiveFilters(),i=r.find(o=>o.id==="searchText");if(i&&r.length===1){const o=i.criteria.query;s.textContent=`Search: "${o}" (${e} results)`}else if(i){const o=i.criteria.query,n=r.length-1;s.textContent=`Search: "${o}" + ${n} filter${n===1?"":"s"} (${e} results)`}else{const o=r.length;s.textContent=`Filtered Results: ${o} filter${o===1?"":"s"} (${e} courses)`}}}updateDepartmentHeader(e){const t=document.querySelector(".content-header h2");t&&(t.textContent=`${e.name} (${e.abbreviation})`)}updateDefaultHeader(){const e=document.querySelector(".content-header h2");e&&(e.textContent="Course Listings")}}new Be;
//# sourceMappingURL=index-BGaWx-b-.js.map
