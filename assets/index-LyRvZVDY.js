(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))s(r);new MutationObserver(r=>{for(const i of r)if(i.type==="childList")for(const o of i.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&s(o)}).observe(document,{childList:!0,subtree:!0});function t(r){const i={};return r.integrity&&(i.integrity=r.integrity),r.referrerPolicy&&(i.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?i.credentials="include":r.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function s(r){if(r.ep)return;r.ep=!0;const i=t(r);fetch(r.href,i)}})();var p=(h=>(h.MONDAY="mon",h.TUESDAY="tue",h.WEDNESDAY="wed",h.THURSDAY="thu",h.FRIDAY="fri",h.SATURDAY="sat",h.SUNDAY="sun",h))(p||{});const F=class F{constructor(){this.scheduleDB=null}async loadCourseData(){try{const e=await this.fetchFreshData();return this.scheduleDB=e,e}catch(e){throw console.error("Failed to load course data:",e),new Error("No course data available")}}async fetchFreshData(){const e=await fetch(F.WPI_COURSE_DATA_URL,{method:"GET",headers:{Accept:"application/json"},cache:"no-cache"});if(!e.ok)throw new Error(`Failed to fetch course data: ${e.status} ${e.statusText}`);const t=await e.json();return this.parseJSONData(t)}parseJSONData(e){if(!e.departments||!Array.isArray(e.departments))throw console.error("Invalid JSON data structure:",e),new Error("Invalid JSON data structure - missing departments array");const t={departments:this.parseConstructedDepartments(e.departments),generated:e.generated||new Date().toISOString()};return this.logMA1024Sections(t),t}parseConstructedDepartments(e){return e.map(t=>{const s={abbreviation:t.abbreviation,name:t.name,courses:[]};return s.courses=t.courses.map(r=>({id:r.id,number:r.number,name:r.name,description:this.stripHtml(r.description||""),department:s,sections:this.parseConstructedSections(r.sections||[]),minCredits:r.min_credits||0,maxCredits:r.max_credits||0})),s})}parseConstructedSections(e){return e.map(t=>{const s=t.term||"",r=t.number||"",i=t.computedTerm;return{crn:t.crn||0,number:r,seats:t.seats||0,seatsAvailable:t.seats_available||0,actualWaitlist:t.actual_waitlist||0,maxWaitlist:t.max_waitlist||0,note:t.note,description:this.stripHtml(t.description||""),term:s,computedTerm:i,periods:this.parseConstructedPeriods(t.periods||[])}})}parseConstructedPeriods(e){return e.map(t=>({type:t.type||"Lecture",professor:t.professor||"",professorEmail:void 0,startTime:this.parseConstructedTime(t.start_time),endTime:this.parseConstructedTime(t.end_time),location:t.location||"",building:t.building||"",room:t.room||"",seats:t.seats||0,seatsAvailable:t.seats_available||0,actualWaitlist:t.actual_waitlist||0,maxWaitlist:t.max_waitlist||0,days:this.parseConstructedDays(t.days||[]),specificSection:t.specific_section}))}parseConstructedTime(e){if(!e||e==="TBA")return{hours:0,minutes:0,displayTime:"TBD"};const t=e.match(/(\d{1,2}):(\d{2})/);if(!t)return{hours:0,minutes:0,displayTime:e};const s=parseInt(t[1]),r=parseInt(t[2]),i=s===0?12:s>12?s-12:s,o=s>=12?"PM":"AM",n=`${i}:${r.toString().padStart(2,"0")} ${o}`;return{hours:s,minutes:r,displayTime:n}}parseConstructedDays(e){const t=new Set;for(const s of e)switch(s.toLowerCase()){case"mon":t.add(p.MONDAY);break;case"tue":t.add(p.TUESDAY);break;case"wed":t.add(p.WEDNESDAY);break;case"thu":t.add(p.THURSDAY);break;case"fri":t.add(p.FRIDAY);break;case"sat":t.add(p.SATURDAY);break;case"sun":t.add(p.SUNDAY);break}return t}logMA1024Sections(e){}stripHtml(e){return e.replace(/<[^>]*>/g,"").replace(/&[^;]+;/g," ").trim()}getCachedData(){try{const e=localStorage.getItem(F.LOCAL_STORAGE_KEY);return e?JSON.parse(e).scheduleDB:null}catch(e){return console.warn("Failed to parse cached course data:",e),null}}cacheData(e){try{const t={scheduleDB:e,timestamp:Date.now()};localStorage.setItem(F.LOCAL_STORAGE_KEY,JSON.stringify(t))}catch(t){console.warn("Failed to cache course data:",t)}}isCacheExpired(){try{const e=localStorage.getItem(F.LOCAL_STORAGE_KEY);if(!e)return!0;const t=JSON.parse(e),s=Date.now()-t.timestamp,r=F.CACHE_EXPIRY_HOURS*60*60*1e3;return s>r}catch{return!0}}getScheduleDB(){return this.scheduleDB}searchCourses(e,t){if(!this.scheduleDB)return[];const s=[];for(const i of this.scheduleDB.departments)t&&t.length>0&&!t.includes(i.abbreviation.toLowerCase())||s.push(...i.courses);if(!e.trim())return s;const r=e.toLowerCase();return s.filter(i=>i.name.toLowerCase().includes(r)||i.number.toLowerCase().includes(r)||i.id.toLowerCase().includes(r)||i.department.abbreviation.toLowerCase().includes(r))}getAllDepartments(){return this.scheduleDB?.departments||[]}};F.WPI_COURSE_DATA_URL="./course-data-constructed.json",F.LOCAL_STORAGE_KEY="wpi-course-data",F.CACHE_EXPIRY_HOURS=1;let B=F;const V="WPI Classic",j="wpi-classic",Y="Traditional WPI colors and styling",W={primary:"#ac2b37",primaryHover:"#8e2329",primaryLight:"#d4424f",secondary:"#f5f5f7",secondaryHover:"#e5e5e7",background:"#f5f5f7",backgroundAlt:"#ffffff",surface:"#ffffff",surfaceHover:"#fbfbfd",text:"#1d1d1f",textSecondary:"#86868b",textInverse:"#ffffff",border:"#e5e5e7",borderHover:"#d2d2d7",success:"#30d158",warning:"#ff9500",error:"#d32f2f",info:"#007aff"},_={fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",fontFamilyMono:"'SF Mono', Monaco, 'Cascadia Code', monospace"},G={baseUnit:"1rem",headerHeight:"64px",sidebarWidth:"280px",rightPanelWidth:"320px"},K={borderRadius:"6px",borderRadiusLarge:"8px",shadow:"0 1px 3px rgba(0,0,0,0.1)",shadowHover:"0 2px 8px rgba(172, 43, 55, 0.1)",transition:"all 0.2s ease"},J={name:V,id:j,description:Y,colors:W,typography:_,spacing:G,effects:K},Q="WPI Dark",Z="wpi-dark",X="Dark mode theme with WPI accent colors",ee={primary:"#d4424f",primaryHover:"#ac2b37",primaryLight:"#e85a66",secondary:"#2c2c2e",secondaryHover:"#3a3a3c",background:"#1c1c1e",backgroundAlt:"#2c2c2e",surface:"#2c2c2e",surfaceHover:"#3a3a3c",text:"#ffffff",textSecondary:"#98989d",textInverse:"#1d1d1f",border:"#3a3a3c",borderHover:"#48484a",success:"#30d158",warning:"#ff9f0a",error:"#ff453a",info:"#64d2ff"},te={fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",fontFamilyMono:"'SF Mono', Monaco, 'Cascadia Code', monospace"},se={baseUnit:"1rem",headerHeight:"64px",sidebarWidth:"280px",rightPanelWidth:"320px"},re={borderRadius:"6px",borderRadiusLarge:"8px",shadow:"0 2px 8px rgba(0,0,0,0.3)",shadowHover:"0 4px 16px rgba(212, 66, 79, 0.2)",transition:"all 0.2s ease"},ie={name:Q,id:Z,description:X,colors:ee,typography:te,spacing:se,effects:re},oe="WPI Light",ne="wpi-light",ce="Clean light theme with softer WPI colors",le={primary:"#b8394a",primaryHover:"#9c2f3d",primaryLight:"#d4556b",secondary:"#f8f8fa",secondaryHover:"#ededef",background:"#ffffff",backgroundAlt:"#f8f8fa",surface:"#ffffff",surfaceHover:"#f8f8fa",text:"#2c2c2e",textSecondary:"#6d6d70",textInverse:"#ffffff",border:"#d1d1d6",borderHover:"#c7c7cc",success:"#28a745",warning:"#fd7e14",error:"#dc3545",info:"#17a2b8"},ae={fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",fontFamilyMono:"'SF Mono', Monaco, 'Cascadia Code', monospace"},de={baseUnit:"1rem",headerHeight:"64px",sidebarWidth:"280px",rightPanelWidth:"320px"},ue={borderRadius:"8px",borderRadiusLarge:"12px",shadow:"0 1px 4px rgba(0,0,0,0.08)",shadowHover:"0 3px 12px rgba(184, 57, 74, 0.15)",transition:"all 0.2s ease"},he={name:oe,id:ne,description:ce,colors:le,typography:ae,spacing:de,effects:ue},me="High Contrast",fe="high-contrast",pe="Accessibility-focused high contrast theme",ve={primary:"#000000",primaryHover:"#333333",primaryLight:"#666666",secondary:"#ffffff",secondaryHover:"#f0f0f0",background:"#ffffff",backgroundAlt:"#f8f8f8",surface:"#ffffff",surfaceHover:"#f0f0f0",text:"#000000",textSecondary:"#444444",textInverse:"#ffffff",border:"#000000",borderHover:"#333333",success:"#006600",warning:"#cc6600",error:"#cc0000",info:"#0066cc"},ge={fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",fontFamilyMono:"'SF Mono', Monaco, 'Cascadia Code', monospace"},Se={baseUnit:"1rem",headerHeight:"64px",sidebarWidth:"280px",rightPanelWidth:"320px"},ye={borderRadius:"2px",borderRadiusLarge:"4px",shadow:"0 0 0 2px #000000",shadowHover:"0 0 0 3px #000000",transition:"all 0.1s ease"},be={name:me,id:fe,description:pe,colors:ve,typography:ge,spacing:Se,effects:ye};class M{constructor(){this.currentTheme="wpi-classic",this.themes=new Map,this.listeners=new Set,this.storageKey="wpi-planner-theme",this.initializeThemes(),this.loadSavedTheme()}static getInstance(){return M.instance||(M.instance=new M),M.instance}initializeThemes(){this.registerTheme(J),this.registerTheme(ie),this.registerTheme(he),this.registerTheme(be)}loadSavedTheme(){try{const e=localStorage.getItem(this.storageKey);e&&this.themes.has(e)&&(this.currentTheme=e)}catch(e){console.warn("Failed to load saved theme preference:",e)}this.applyTheme(this.currentTheme)}registerTheme(e){if(!this.isValidTheme(e)){console.error("Invalid theme definition:",e);return}this.themes.set(e.id,e)}isValidTheme(e){return e&&typeof e.name=="string"&&typeof e.id=="string"&&typeof e.description=="string"&&e.colors&&e.typography&&e.spacing&&e.effects}getAvailableThemes(){return Array.from(this.themes.values())}getCurrentTheme(){return this.themes.get(this.currentTheme)||null}getCurrentThemeId(){return this.currentTheme}setTheme(e){if(!this.themes.has(e))return console.error(`Theme '${e}' not found`),!1;const t=this.currentTheme,s=e,r=this.themes.get(e);this.currentTheme=e,this.applyTheme(e),this.saveThemePreference(e);const i={oldTheme:t,newTheme:s,themeDefinition:r};return this.notifyListeners(i),!0}applyTheme(e){const t=this.themes.get(e);if(!t)return;const s=document.documentElement;Object.entries(t.colors).forEach(([r,i])=>{s.style.setProperty(`--color-${this.kebabCase(r)}`,i)}),Object.entries(t.typography).forEach(([r,i])=>{s.style.setProperty(`--font-${this.kebabCase(r)}`,i)}),Object.entries(t.spacing).forEach(([r,i])=>{s.style.setProperty(`--spacing-${this.kebabCase(r)}`,i)}),Object.entries(t.effects).forEach(([r,i])=>{s.style.setProperty(`--effect-${this.kebabCase(r)}`,i)}),document.body.className=document.body.className.replace(/theme-[\w-]+/g,"").trim(),document.body.classList.add(`theme-${e}`)}kebabCase(e){return e.replace(/([a-z])([A-Z])/g,"$1-$2").toLowerCase()}saveThemePreference(e){try{localStorage.setItem(this.storageKey,e)}catch(t){console.warn("Failed to save theme preference:",t)}}detectSystemPreference(){if(typeof window<"u"&&window.matchMedia){if(window.matchMedia("(prefers-color-scheme: dark)").matches)return"wpi-dark";if(window.matchMedia("(prefers-contrast: high)").matches)return"high-contrast"}return"wpi-classic"}useSystemPreference(){const e=this.detectSystemPreference();return this.setTheme(e)}onThemeChange(e){this.listeners.add(e)}offThemeChange(e){this.listeners.delete(e)}notifyListeners(e){this.listeners.forEach(t=>{try{t(e)}catch(s){console.error("Error in theme change listener:",s)}})}previewTheme(e){return this.themes.has(e)?(this.applyTheme(e),!0):!1}resetToCurrentTheme(){this.applyTheme(this.currentTheme)}exportCurrentTheme(){const e=this.getCurrentTheme();if(!e)throw new Error("No current theme to export");return JSON.stringify(e,null,2)}importTheme(e){try{const t=JSON.parse(e);return this.isValidTheme(t)?(this.registerTheme(t),!0):!1}catch(t){return console.error("Failed to import theme:",t),!1}}getThemeById(e){return this.themes.get(e)||null}hasTheme(e){return this.themes.has(e)}removeTheme(e){return["wpi-classic","wpi-dark","wpi-light","high-contrast"].includes(e)?(console.warn(`Cannot remove built-in theme: ${e}`),!1):(this.currentTheme===e&&this.setTheme("wpi-classic"),this.themes.delete(e))}}const y=class y{constructor(){this.replacer=(e,t)=>{if(t instanceof Set)return{__type:"Set",value:[...t]};if(e==="department"&&t&&t.courses)return{abbreviation:t.abbreviation,name:t.name};if(!(e==="selectedSection"&&t&&typeof t=="object"&&t.number))return t},this.reviver=(e,t)=>typeof t=="object"&&t!==null&&t.__type==="Set"?new Set(t.value):t}saveUserState(e){this.handleStorageOperation(()=>{const t=JSON.stringify(e,this.replacer);localStorage.setItem(y.STORAGE_KEYS.USER_STATE,t)},"Failed to save user state")}loadUserState(){return this.handleStorageOperation(()=>{const e=localStorage.getItem(y.STORAGE_KEYS.USER_STATE);return e?JSON.parse(e,this.reviver):null},"Failed to load user state",null)}saveSchedule(e){this.handleStorageOperation(()=>{const t=this.loadAllSchedules(),s=t.findIndex(i=>i.id===e.id);s>=0?t[s]=e:t.push(e);const r=JSON.stringify(t,this.replacer);localStorage.setItem(y.STORAGE_KEYS.SCHEDULES,r)},"Failed to save schedule")}loadSchedule(e){try{return this.loadAllSchedules().find(s=>s.id===e)||null}catch(t){return console.warn("Failed to load schedule:",t),null}}loadAllSchedules(){return this.handleStorageOperation(()=>{const e=localStorage.getItem(y.STORAGE_KEYS.SCHEDULES);return e?JSON.parse(e,this.reviver):[]},"Failed to load schedules",[])}deleteSchedule(e){try{const s=this.loadAllSchedules().filter(r=>r.id!==e);localStorage.setItem(y.STORAGE_KEYS.SCHEDULES,JSON.stringify(s))}catch(t){console.warn("Failed to delete schedule:",t)}}savePreferences(e){this.handleStorageOperation(()=>{const t=JSON.stringify(e,this.replacer);localStorage.setItem(y.STORAGE_KEYS.PREFERENCES,t)},"Failed to save preferences")}loadPreferences(){return this.handleStorageOperation(()=>{const e=localStorage.getItem(y.STORAGE_KEYS.PREFERENCES);return e?JSON.parse(e,this.reviver):this.getDefaultPreferences()},"Failed to load preferences",this.getDefaultPreferences())}getDefaultPreferences(){return{preferredTimeRange:{startTime:{hours:8,minutes:0},endTime:{hours:18,minutes:0}},preferredDays:new Set(["mon","tue","wed","thu","fri"]),avoidBackToBackClasses:!1,theme:"wpi-classic"}}clearAllData(){try{Object.values(y.STORAGE_KEYS).forEach(e=>{localStorage.removeItem(e)})}catch(e){console.warn("Failed to clear storage:",e)}}exportData(){const e=this.loadUserState(),t=this.loadAllSchedules(),s=this.loadPreferences(),r={version:"1.0",timestamp:new Date().toISOString(),state:e,schedules:t,preferences:s};return JSON.stringify(r,null,2)}importData(e){try{const t=JSON.parse(e);return t.state&&this.saveUserState(t.state),t.preferences&&this.savePreferences(t.preferences),t.schedules&&t.schedules.forEach(s=>{this.saveSchedule(s)}),!0}catch(t){return console.error("Failed to import data:",t),!1}}handleStorageOperation(e,t,s){try{return e()}catch(r){return console.warn(`${t}:`,r),s}}saveThemePreference(e){try{localStorage.setItem(y.STORAGE_KEYS.THEME,e)}catch(t){console.warn("Failed to save theme preference:",t)}}loadThemePreference(){try{return localStorage.getItem(y.STORAGE_KEYS.THEME)||"wpi-classic"}catch(e){return console.warn("Failed to load theme preference:",e),"wpi-classic"}}saveSelectedCourses(e){this.handleStorageOperation(()=>{const t=JSON.stringify(e,this.replacer);localStorage.setItem(y.STORAGE_KEYS.SELECTED_COURSES,t)},"Failed to save selected courses")}loadSelectedCourses(){return this.handleStorageOperation(()=>{const e=localStorage.getItem(y.STORAGE_KEYS.SELECTED_COURSES);return e?JSON.parse(e,this.reviver):[]},"Failed to load selected courses",[])}clearSelectedCourses(){try{localStorage.removeItem(y.STORAGE_KEYS.SELECTED_COURSES)}catch(e){console.warn("Failed to clear selected courses:",e)}}saveActiveScheduleId(e){try{e?localStorage.setItem(y.STORAGE_KEYS.ACTIVE_SCHEDULE_ID,e):localStorage.removeItem(y.STORAGE_KEYS.ACTIVE_SCHEDULE_ID)}catch(t){console.warn("Failed to save active schedule ID:",t)}}loadActiveScheduleId(){try{const e=localStorage.getItem(y.STORAGE_KEYS.ACTIVE_SCHEDULE_ID);return e&&e.length>0?e:null}catch(e){return console.warn("Failed to load active schedule ID:",e),null}}clearActiveScheduleId(){try{localStorage.removeItem(y.STORAGE_KEYS.ACTIVE_SCHEDULE_ID)}catch(e){console.warn("Failed to clear active schedule ID:",e)}}};y.STORAGE_KEYS={USER_STATE:"wpi-planner-user-state",PREFERENCES:"wpi-planner-preferences",SCHEDULES:"wpi-planner-schedules",SELECTED_COURSES:"wpi-planner-selected-courses",THEME:"wpi-planner-theme",ACTIVE_SCHEDULE_ID:"wpi-planner-active-schedule-id"};let I=y;class Ce{constructor(){this.dropdownElement=null,this.optionsElement=null,this.currentThemeNameElement=null,this.isOpen=!1,this.themeManager=M.getInstance(),this.storageManager=new I,this.init()}init(){this.setupElements(),this.loadSavedTheme(),this.setupEventListeners(),this.renderThemeOptions()}setupElements(){this.dropdownElement=document.getElementById("theme-dropdown"),this.optionsElement=document.getElementById("theme-options"),this.currentThemeNameElement=document.getElementById("current-theme-name")}loadSavedTheme(){const e=this.storageManager.loadThemePreference();this.themeManager.setTheme(e),this.updateCurrentThemeDisplay()}setupEventListeners(){!this.dropdownElement||!this.optionsElement||(this.dropdownElement.addEventListener("click",e=>{e.stopPropagation(),this.toggleDropdown()}),document.addEventListener("click",()=>{this.closeDropdown()}),this.optionsElement.addEventListener("click",e=>{e.stopPropagation()}))}toggleDropdown(){this.isOpen?this.closeDropdown():this.openDropdown()}openDropdown(){!this.dropdownElement||!this.optionsElement||(this.isOpen=!0,this.dropdownElement.classList.add("open"),this.optionsElement.classList.add("show"))}closeDropdown(){!this.dropdownElement||!this.optionsElement||(this.isOpen=!1,this.dropdownElement.classList.remove("open"),this.optionsElement.classList.remove("show"))}renderThemeOptions(){if(!this.optionsElement)return;const e=this.themeManager.getAvailableThemes(),t=this.themeManager.getCurrentThemeId();let s="";e.forEach(r=>{const i=r.id===t;s+=`
                <div class="theme-option ${i?"active":""}" data-theme-id="${r.id}">
                    <div class="theme-option-name">${r.name}</div>
                    <div class="theme-option-description">${r.description}</div>
                </div>
            `}),this.optionsElement.innerHTML=s,this.optionsElement.querySelectorAll(".theme-option").forEach(r=>{r.addEventListener("click",()=>{const i=r.dataset.themeId;i&&this.selectTheme(i)})})}selectTheme(e){this.themeManager.setTheme(e)&&(this.storageManager.saveThemePreference(e),this.updateCurrentThemeDisplay(),this.updateActiveOption(e),this.closeDropdown())}updateCurrentThemeDisplay(){if(!this.currentThemeNameElement)return;const e=this.themeManager.getCurrentTheme();e&&(this.currentThemeNameElement.textContent=e.name)}updateActiveOption(e){if(!this.optionsElement)return;this.optionsElement.querySelectorAll(".theme-option").forEach(s=>{s.classList.remove("active")});const t=this.optionsElement.querySelector(`[data-theme-id="${e}"]`);t&&t.classList.add("active")}refresh(){this.renderThemeOptions(),this.updateCurrentThemeDisplay()}setTheme(e){this.selectTheme(e)}}class Fe{constructor(e,t){this.currentActiveSchedule=null,this.isDropdownOpen=!1,console.log("🏗️ ScheduleSelector: Constructor called, initializing..."),this.scheduleManagementService=e;const s=document.getElementById(t);if(!s)throw new Error(`Container with ID '${t}' not found`);this.container=s,console.log("🏗️ ScheduleSelector: Container found, calling init()"),this.init(),console.log("✅ ScheduleSelector: Initialization complete")}init(){this.render(),this.setupEventListeners(),this.setupScheduleChangeListener(),this.setupCourseSelectionListener(),this.currentActiveSchedule=this.scheduleManagementService.getActiveSchedule(),this.updateDisplay()}render(){this.container.innerHTML=`
            <div class="schedule-selector">
                <div class="schedule-selector-trigger" id="schedule-selector-trigger">
                    <div class="schedule-selector-content">
                        <div class="schedule-selector-icon">📋</div>
                        <div class="schedule-selector-text">
                            <div class="schedule-name" id="active-schedule-name">My Schedule</div>
                            <div class="schedule-subtitle">Active Schedule</div>
                        </div>
                    </div>
                    <div class="schedule-selector-arrow">▼</div>
                </div>
                
                <div class="schedule-selector-dropdown" id="schedule-selector-dropdown">
                    <div class="schedule-dropdown-header">
                        <h3>Schedules</h3>
                        <button class="btn btn-primary btn-small" id="new-schedule-btn">+ New</button>
                    </div>
                    
                    <div class="schedule-list" id="schedule-list">
                        <!-- Schedule items will be populated here -->
                    </div>
                    
                    <div class="schedule-dropdown-footer">
                        <button class="btn btn-secondary btn-small" id="import-schedule-btn">Import</button>
                        <button class="btn btn-secondary btn-small" id="export-schedule-btn">Export</button>
                    </div>
                </div>
            </div>
        `}setupEventListeners(){const e=this.container.querySelector("#schedule-selector-trigger"),t=this.container.querySelector("#schedule-selector-dropdown"),s=this.container.querySelector("#new-schedule-btn"),r=this.container.querySelector("#import-schedule-btn"),i=this.container.querySelector("#export-schedule-btn");e?.addEventListener("click",o=>{o.stopPropagation(),this.toggleDropdown()}),document.addEventListener("click",o=>{this.container.contains(o.target)||this.closeDropdown()}),s?.addEventListener("click",o=>{o.stopPropagation(),this.createNewSchedule()}),r?.addEventListener("click",o=>{o.stopPropagation(),this.importSchedule()}),i?.addEventListener("click",o=>{o.stopPropagation(),this.exportActiveSchedule()}),t?.addEventListener("click",o=>{o.stopPropagation()})}setupScheduleChangeListener(){this.scheduleManagementService.onActiveScheduleChange(e=>{this.currentActiveSchedule=e,this.updateDisplay()})}setupCourseSelectionListener(){console.log("🔧 ScheduleSelector: Setting up course selection listener"),this.scheduleManagementService.getCourseSelectionService().onSelectionChange(()=>{console.log("🔄 ScheduleSelector: Course selection changed, updating display"),console.log("📝 ScheduleSelector: Refreshing schedule list with updated course counts"),this.updateScheduleList()}),console.log("✅ ScheduleSelector: Course selection listener setup complete")}toggleDropdown(){this.isDropdownOpen?this.closeDropdown():this.openDropdown()}openDropdown(){const e=this.container.querySelector("#schedule-selector-dropdown");e&&(e.style.display="block",this.isDropdownOpen=!0,this.container.classList.add("dropdown-open"),this.updateScheduleList())}closeDropdown(){const e=this.container.querySelector("#schedule-selector-dropdown");e&&(e.style.display="none",this.isDropdownOpen=!1,this.container.classList.remove("dropdown-open"))}updateDisplay(){const e=this.container.querySelector("#active-schedule-name");e&&(this.currentActiveSchedule?e.textContent=this.currentActiveSchedule.name:e.textContent="No Schedule"),this.isDropdownOpen&&this.updateScheduleList()}updateScheduleList(){console.log("📋 ScheduleSelector: updateScheduleList() called");const e=this.container.querySelector("#schedule-list");if(!e)return;const t=this.scheduleManagementService.getAllSchedules(),s=this.scheduleManagementService.getActiveScheduleId();if(console.log(`📊 ScheduleSelector: Found ${t.length} schedules, active: ${s}`),t.length===0){e.innerHTML='<div class="schedule-list-empty">No schedules found</div>';return}e.innerHTML=t.map(r=>{const i=r.id===s,o=i?this.scheduleManagementService.getCourseSelectionService().getSelectedCourses().length:r.selectedCourses.length;return i&&console.log(`🔢 ScheduleSelector: Active schedule "${r.name}" - live count: ${o}, stored count: ${r.selectedCourses.length}`),`
                <div class="schedule-item ${i?"active":""}" data-schedule-id="${r.id}">
                    <div class="schedule-item-info">
                        <div class="schedule-item-name" data-editable="true" data-original-name="${r.name}">${r.name}</div>
                        <div class="schedule-item-details">${o} course${o===1?"":"s"}</div>
                    </div>
                    <div class="schedule-item-actions">
                        ${i?'<span class="active-indicator">✓</span>':'<button class="btn-link switch-btn">Switch</button>'}
                        <button class="btn-link menu-btn" title="More options">⋮</button>
                    </div>
                    <div class="schedule-item-menu" style="display: none;">
                        <button class="menu-action" data-action="rename">Rename</button>
                        <button class="menu-action" data-action="duplicate">Duplicate</button>
                        <button class="menu-action" data-action="export">Export</button>
                        ${t.length>1?'<button class="menu-action danger" data-action="delete">Delete</button>':""}
                    </div>
                </div>
            `}).join(""),this.setupScheduleItemListeners()}setupScheduleItemListeners(){const e=this.container.querySelector("#schedule-list");e&&(e.addEventListener("click",t=>{const s=t.target;if(s.classList.contains("switch-btn")){const r=s.closest(".schedule-item")?.getAttribute("data-schedule-id");r&&this.switchToSchedule(r)}if(s.classList.contains("menu-btn")&&(t.stopPropagation(),this.toggleScheduleMenu(s)),s.classList.contains("menu-action")){const r=s.getAttribute("data-action"),i=s.closest(".schedule-item")?.getAttribute("data-schedule-id");r&&i&&this.handleScheduleAction(r,i)}}),e.addEventListener("dblclick",t=>{const s=t.target;s.classList.contains("schedule-item-name")&&this.startRenaming(s)}))}toggleScheduleMenu(e){document.querySelectorAll(".schedule-item-menu").forEach(s=>{s!==e.parentElement?.querySelector(".schedule-item-menu")&&(s.style.display="none")});const t=e.parentElement?.querySelector(".schedule-item-menu");t&&(t.style.display=t.style.display==="none"?"block":"none")}handleScheduleAction(e,t){switch(e){case"rename":this.renameSchedule(t);break;case"duplicate":this.duplicateSchedule(t);break;case"export":this.exportSchedule(t);break;case"delete":this.deleteSchedule(t);break}document.querySelectorAll(".schedule-item-menu").forEach(s=>{s.style.display="none"})}switchToSchedule(e){this.setLoadingState(!0);try{console.log(`Switching to schedule: ${e}`),this.scheduleManagementService.setActiveSchedule(e),console.log(`Schedule switch initiated for: ${e}`)}catch(t){console.error("Failed to switch schedule:",t),alert("Failed to switch schedule. Please try again."),this.setLoadingState(!1)}finally{setTimeout(()=>{this.setLoadingState(!1),this.closeDropdown();const t=this.scheduleManagementService.getCourseSelectionService().getSelectedCourses().length;console.log(`Schedule switch loading state cleared - ${t} selected courses`),console.log("🔄 Force reloading page after schedule switch"),window.location.reload()},200)}}createNewSchedule(){const e=prompt("Enter name for new schedule:","New Schedule");if(e&&e.trim()){this.setLoadingState(!0);try{console.log(`Creating new schedule: ${e.trim()}`);const t=this.scheduleManagementService.createNewSchedule(e.trim());this.scheduleManagementService.setActiveSchedule(t.id),console.log(`Created and switched to new schedule: ${e.trim()} (${t.id})`)}catch(t){console.error("Failed to create new schedule:",t),alert("Failed to create new schedule. Please try again."),this.setLoadingState(!1)}finally{setTimeout(()=>{this.setLoadingState(!1),this.closeDropdown();const t=this.scheduleManagementService.getCourseSelectionService().getSelectedCourses().length;console.log(`New schedule creation loading state cleared - ${t} selected courses`),console.log("🔄 Force reloading page after new schedule creation"),window.location.reload()},200)}}}renameSchedule(e){const t=this.scheduleManagementService.loadSchedule(e);if(!t)return;const s=prompt("Enter new name:",t.name);s&&s.trim()&&s.trim()!==t.name&&(this.scheduleManagementService.renameSchedule(e,s.trim()),this.updateScheduleList())}duplicateSchedule(e){const t=this.scheduleManagementService.loadSchedule(e);if(!t)return;const s=prompt("Enter name for duplicate:",`${t.name} (Copy)`);s&&s.trim()&&(this.scheduleManagementService.duplicateSchedule(e,s.trim()),this.updateScheduleList())}deleteSchedule(e){const t=this.scheduleManagementService.loadSchedule(e);if(!t)return;confirm(`Are you sure you want to delete "${t.name}"? This action cannot be undone.`)&&(this.scheduleManagementService.deleteSchedule(e)?this.updateScheduleList():alert("Cannot delete the last remaining schedule."))}exportSchedule(e){const t=this.scheduleManagementService.exportSchedule(e);if(t){const r=`${this.scheduleManagementService.loadSchedule(e)?.name||"schedule"}.json`;this.downloadJSON(t,r)}}exportActiveSchedule(){const e=this.scheduleManagementService.getActiveScheduleId();e&&(this.exportSchedule(e),this.closeDropdown())}importSchedule(){const e=document.createElement("input");e.type="file",e.accept=".json",e.onchange=t=>{const s=t.target.files?.[0];if(s){const r=new FileReader;r.onload=i=>{const o=i.target?.result,n=this.scheduleManagementService.importSchedule(o);n?(alert(`Successfully imported "${n.name}"`),this.updateScheduleList()):alert("Failed to import schedule. Please check the file format.")},r.readAsText(s)}},e.click(),this.closeDropdown()}downloadJSON(e,t){const s=new Blob([e],{type:"application/json"}),r=URL.createObjectURL(s),i=document.createElement("a");i.href=r,i.download=t,document.body.appendChild(i),i.click(),document.body.removeChild(i),URL.revokeObjectURL(r)}startRenaming(e){const t=e.getAttribute("data-original-name")||e.textContent||"",s=e.closest(".schedule-item")?.getAttribute("data-schedule-id");if(!s)return;const r=document.createElement("input");r.type="text",r.value=t,r.className="schedule-name-input";const i=()=>{const o=r.value.trim();o&&o!==t&&this.scheduleManagementService.renameSchedule(s,o),e.textContent=o||t,e.setAttribute("data-original-name",o||t),e.style.display="block",r.remove()};r.addEventListener("blur",i),r.addEventListener("keydown",o=>{o.key==="Enter"?r.blur():o.key==="Escape"&&(r.value=t,r.blur())}),e.style.display="none",e.parentNode?.insertBefore(r,e.nextSibling),r.focus(),r.select()}refresh(){this.currentActiveSchedule=this.scheduleManagementService.getActiveSchedule(),this.updateDisplay()}setLoadingState(e){const t=this.container.querySelector("#schedule-selector-trigger"),s=this.container.querySelector("#active-schedule-name");t&&s&&(e?(t.style.opacity="0.6",t.style.pointerEvents="none",s.textContent="Switching..."):(t.style.opacity="1",t.style.pointerEvents="auto"))}}class we{constructor(){this.selectedCourses=new Map,this.listeners=new Set,this.allSections=new Set,this.allDepartments=[]}addCourse(e,t=!1){const s={course:e,selectedSection:null,selectedSectionNumber:null,isRequired:t};this.selectedCourses.set(e,s),this.notifyListeners()}removeCourse(e){console.log(`🗑️ CourseManager: Removing course ${e.department.abbreviation}${e.number}`),this.selectedCourses.delete(e),this.notifyListeners()}getSelectedCourses(){return Array.from(this.selectedCourses.values())}getSelectedCourse(e){return this.selectedCourses.get(e)}isSelected(e){return this.selectedCourses.has(e)}getAvailableSections(e){const t=this.selectedCourses.get(e);return this.validateCourseExists(e,t)?t.course.sections:[]}clearAll(){this.selectedCourses.clear(),this.notifyListeners()}onSelectionChange(e){this.listeners.add(e)}offSelectionChange(e){this.listeners.delete(e)}setSelectedSection(e,t){const s=this.selectedCourses.get(e);if(!this.validateCourseExists(e,s))return;const r=s.selectedSectionNumber;console.log(`📝 CourseManager: Setting section for ${e.department.abbreviation}${e.number} from "${r}" to "${t}"`);const i=t&&e.sections.find(o=>o.number===t)||null;s.selectedSection=i,s.selectedSectionNumber=t,this.notifyListeners()}getSelectedSection(e){return this.selectedCourses.get(e)?.selectedSectionNumber||null}getSelectedSectionObject(e){return this.selectedCourses.get(e)?.selectedSection||null}loadSelectedCourses(e){this.selectedCourses.clear(),e.forEach(t=>{if(t.selectedSection&&typeof t.selectedSection=="string"){const s=t.selectedSection,r=t.course.sections.find(i=>i.number===s)||null;t.selectedSection=r,t.selectedSectionNumber=s}else t.selectedSection&&!t.selectedSectionNumber&&(t.selectedSectionNumber=t.selectedSection.number);this.selectedCourses.set(t.course,t)}),this.notifyListeners()}validateCourseExists(e,t){return t?!0:(console.warn(`Course ${e.id} not found in selected courses`),!1)}notifyListeners(){const e=this.getSelectedCourses();console.log(`🔔 CourseManager: Notifying ${this.listeners.size} listeners of course changes`),console.log(`📊 Current selected courses: ${e.length} total`),e.forEach(t=>{const s=t.selectedSectionNumber?`section ${t.selectedSectionNumber}`:"no section selected";console.log(`  • ${t.course.department.abbreviation}${t.course.number} (${s})`)}),this.listeners.forEach(t=>t(e))}setAllDepartments(e){this.allDepartments=e,this.populateAllSections(),this.refreshSelectedCoursesWithFreshData()}populateAllSections(){this.allSections.clear();for(const e of this.allDepartments)for(const t of e.courses)for(const s of t.sections)this.allSections.add(s)}getAllSections(){return Array.from(this.allSections)}getAllSectionsForCourse(e){return e.sections}getAllSectionsForDepartment(e){const t=this.allDepartments.find(r=>r.abbreviation===e);if(!t)return[];const s=[];for(const r of t.courses)s.push(...r.sections);return s}getAllDepartments(){return this.allDepartments}refreshSelectedCoursesWithFreshData(){if(this.allDepartments.length===0)return;let e=0;const t=new Map;this.selectedCourses.forEach((s,r)=>{const i=this.findFreshCourse(r);if(i){const o={course:i,selectedSection:null,selectedSectionNumber:s.selectedSectionNumber,isRequired:s.isRequired};if(s.selectedSectionNumber){const n=i.sections.find(c=>c.number===s.selectedSectionNumber);n&&(o.selectedSection=n)}t.set(i,o),e++}else t.set(r,s)}),this.selectedCourses=t,e>0&&(console.log(`[CourseManager] Refreshed ${e} selected courses with fresh data`),this.notifyListeners())}findFreshCourse(e){for(const t of this.allDepartments)for(const s of t.courses)if(s.id===e.id&&s.number===e.number)return s;return null}reconstructSectionObjects(){let e=0;this.selectedCourses.forEach((t,s)=>{if(t.selectedSectionNumber&&!t.selectedSection){const r=s.sections.find(i=>i.number===t.selectedSectionNumber)||null;r&&(t.selectedSection=r,e++)}}),e>0&&this.notifyListeners()}findCourseContainingSection(e){for(const t of this.allDepartments)for(const s of t.courses)if(s.sections.includes(e))return s}}class w{static isValidCourse(e){return e&&typeof e.id=="string"&&typeof e.number=="string"&&typeof e.name=="string"&&typeof e.description=="string"&&this.isValidDepartment(e.department)&&Array.isArray(e.sections)&&e.sections.every(t=>this.isValidSection(t))&&typeof e.minCredits=="number"&&typeof e.maxCredits=="number"}static isValidDepartment(e){return e&&typeof e.abbreviation=="string"&&typeof e.name=="string"&&(e.courses===void 0||Array.isArray(e.courses))}static isValidSection(e){return e&&typeof e.crn=="number"&&typeof e.number=="string"&&typeof e.seats=="number"&&typeof e.seatsAvailable=="number"&&typeof e.actualWaitlist=="number"&&typeof e.maxWaitlist=="number"&&typeof e.description=="string"&&typeof e.term=="string"&&Array.isArray(e.periods)&&e.periods.every(t=>this.isValidPeriod(t))}static isValidPeriod(e){return e&&typeof e.type=="string"&&typeof e.professor=="string"&&this.isValidTime(e.startTime)&&this.isValidTime(e.endTime)&&typeof e.location=="string"&&typeof e.building=="string"&&typeof e.room=="string"&&typeof e.seats=="number"&&typeof e.seatsAvailable=="number"&&typeof e.actualWaitlist=="number"&&typeof e.maxWaitlist=="number"&&e.days instanceof Set}static isValidTime(e){return e&&typeof e.hours=="number"&&typeof e.minutes=="number"&&typeof e.displayTime=="string"&&e.hours>=0&&e.hours<=23&&e.minutes>=0&&e.minutes<=59}static isValidSchedulePreferences(e){return e&&this.isValidTimeRange(e.preferredTimeRange)&&e.preferredDays instanceof Set&&typeof e.avoidBackToBackClasses=="boolean"}static isValidTimeRange(e){return e&&this.isValidTime(e.startTime)&&this.isValidTime(e.endTime)}static isValidSelectedCourse(e){return e&&this.isValidCourse(e.course)&&typeof e.isRequired=="boolean"}static isValidSchedule(e){return e&&typeof e.id=="string"&&typeof e.name=="string"&&Array.isArray(e.selectedCourses)&&e.selectedCourses.every(t=>this.isValidSelectedCourse(t))&&Array.isArray(e.generatedSchedules)&&this.isValidSchedulePreferences(e.preferences)}static sanitizeString(e){return e.replace(/<[^>]*>/g,"").trim()}static sanitizeCourseData(e){try{return this.isValidCourse(e)?{...e,name:this.sanitizeString(e.name),description:this.sanitizeString(e.description),sections:e.sections.map(t=>({...t,description:this.sanitizeString(t.description),periods:t.periods.map(s=>({...s,professor:this.sanitizeString(s.professor),location:this.sanitizeString(s.location),building:this.sanitizeString(s.building),room:this.sanitizeString(s.room)}))}))}:null}catch(t){return console.warn("Error sanitizing course data:",t),null}}static validateCourseId(e){return/^[A-Z]{2,4}-\d{3,4}$/.test(e)}static validateSectionNumber(e){return typeof e=="string"&&e.trim().length>0&&/^[\w\s\-/]+$/.test(e)}static validateEmail(e){return/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)}}class H{constructor(e,t){this.courseManager=e||new we,this.storageManager=t||new I,this.loadPersistedSelections(),this.setupPersistenceListener()}selectCourse(e,t=!1){if(!w.isValidCourse(e))throw new Error("Invalid course object provided");this.courseManager.addCourse(e,t)}unselectCourse(e){if(!w.isValidCourse(e))throw new Error("Invalid course object provided");this.courseManager.removeCourse(e)}toggleCourseSelection(e,t=!1){return this.isCourseSelected(e)?(this.unselectCourse(e),!1):(this.selectCourse(e,t),!0)}setSelectedSection(e,t){if(!w.isValidCourse(e))throw new Error("Invalid course object provided");if(t!==null&&!w.validateSectionNumber(t))throw new Error("Invalid sectionNumber provided");this.courseManager.setSelectedSection(e,t)}getSelectedSection(e){if(!w.isValidCourse(e))throw new Error("Invalid course object provided");return this.courseManager.getSelectedSection(e)}getSelectedSectionObject(e){if(!w.isValidCourse(e))throw new Error("Invalid course object provided");return this.courseManager.getSelectedSectionObject(e)}isCourseSelected(e){return w.isValidCourse(e)?this.courseManager.isSelected(e):!1}getSelectedCourses(){return this.courseManager.getSelectedCourses()}getSelectedCourse(e){if(w.isValidCourse(e))return this.courseManager.getSelectedCourse(e)}clearAllSelections(){this.courseManager.clearAll(),this.storageManager.clearSelectedCourses()}getSelectedCoursesCount(){return this.getSelectedCourses().length}getSelectedCourseIds(){return this.getSelectedCourses().map(e=>e.course.id)}onSelectionChange(e){this.courseManager.onSelectionChange(e)}offSelectionChange(e){this.courseManager.offSelectionChange(e)}loadPersistedSelections(){const e=this.storageManager.loadSelectedCourses();e.length>0&&this.courseManager.loadSelectedCourses(e)}setupPersistenceListener(){}persistSelections(){const e=this.getSelectedCourses();this.storageManager.saveSelectedCourses(e)}exportSelections(){const e=this.getSelectedCourses();return JSON.stringify({version:"1.0",timestamp:new Date().toISOString(),selectedCourses:e},null,2)}importSelections(e){try{const t=JSON.parse(e);return t.selectedCourses&&Array.isArray(t.selectedCourses)?(this.courseManager.loadSelectedCourses(t.selectedCourses),!0):!1}catch(t){return console.error("Failed to import selections:",t),!1}}setAllDepartments(e){this.courseManager.setAllDepartments(e)}getAllSections(){return this.courseManager.getAllSections()}getAllSectionsForCourse(e){return this.courseManager.getAllSectionsForCourse(e)}getAllSectionsForDepartment(e){return this.courseManager.getAllSectionsForDepartment(e)}findCourseById(e){for(const t of this.courseManager.getAllDepartments()){const s=t.courses.find(r=>r.id===e);if(s)return s}}unselectCourseById(e){const t=this.findCourseById(e);t&&this.unselectCourse(t)}isCourseSelectedById(e){const t=this.findCourseById(e);return t?this.isCourseSelected(t):!1}setSelectedSectionById(e,t){const s=this.findCourseById(e);s&&this.setSelectedSection(s,t)}getSelectedSectionById(e){const t=this.findCourseById(e);return t?this.getSelectedSection(t):null}getCourseManager(){return this.courseManager}getSelectedCourseById(e){const t=this.findCourseById(e);return t?this.getSelectedCourse(t):void 0}reconstructSectionObjects(){this.courseManager.reconstructSectionObjects()}}var N=(h=>(h.TIME_OVERLAP="time_overlap",h))(N||{});class Te{constructor(){this.conflictCache=new Map}detectConflicts(e){const t=[];for(let s=0;s<e.length;s++)for(let r=s+1;r<e.length;r++){const i=this.getCacheKey(e[s],e[r]);let o=this.conflictCache.get(i);o||(o=this.checkSectionConflicts(e[s],e[r]),this.conflictCache.set(i,o)),t.push(...o)}return t}checkSectionConflicts(e,t){const s=[];for(const r of e.periods)for(const i of t.periods){const o=this.checkPeriodConflict(r,i,e,t);o&&s.push(o)}return s}checkPeriodConflict(e,t,s,r){const i=this.getSharedDays(e.days,t.days);return i.length===0?null:this.hasTimeOverlap(e,t)?{section1:s,section2:r,conflictType:N.TIME_OVERLAP,description:`Time overlap on ${i.join(", ")}: ${e.startTime.displayTime}-${e.endTime.displayTime} conflicts with ${t.startTime.displayTime}-${t.endTime.displayTime}`}:null}getSharedDays(e,t){return Array.from(new Set([...e].filter(s=>t.has(s))))}hasTimeOverlap(e,t){const s=this.timeToMinutes(e.startTime),r=this.timeToMinutes(e.endTime),i=this.timeToMinutes(t.startTime),o=this.timeToMinutes(t.endTime);return s<o&&i<r}timeToMinutes(e){return e.hours*60+e.minutes}isValidSchedule(e){return this.detectConflicts(e).length===0}clearCache(){this.conflictCache.clear()}getCacheKey(e,t){const s=`${e.crn}-${t.crn}`,r=`${t.crn}-${e.crn}`;return s<r?s:r}}class Ae{constructor(){this.modals=new Map,this.currentZIndex=1e3}showModal(e,t){this.hideModal(e),t.style.zIndex=this.currentZIndex.toString(),this.currentZIndex+=10,this.modals.set(e,t),document.body.appendChild(t),requestAnimationFrame(()=>{t.classList.add("show")})}hideModal(e){const t=this.modals.get(e);t&&(t.classList.add("hide"),setTimeout(()=>{t.parentNode&&t.parentNode.removeChild(t),this.modals.delete(e)},200))}hideAllModals(){Array.from(this.modals.keys()).forEach(t=>this.hideModal(t))}isModalOpen(e){return this.modals.has(e)}getOpenModals(){return Array.from(this.modals.keys())}generateId(){return`modal-${Date.now()}-${Math.random().toString(36).substr(2,9)}`}setupModalBehavior(e,t,s={}){const{closeOnBackdrop:r=!0,closeOnEscape:i=!0}=s;if(r&&e.addEventListener("click",o=>{o.target===e&&this.hideModal(t)}),i){const o=n=>{n.key==="Escape"&&(this.hideModal(t),document.removeEventListener("keydown",o))};document.addEventListener("keydown",o)}}}const Ee={BB:"Science",BCB:"Science",CH:"Science",CS:"Science",DS:"Science",GE:"Science",IMGD:"Science",MA:"Science",MTE:"Science",PTE:"Science",NE:"Science",PH:"Science",AE:"Engineering",AR:"Engineering",ARE:"Engineering",BME:"Engineering",CE:"Engineering",CHE:"Engineering",ECE:"Engineering",ES:"Engineering",FP:"Engineering",ME:"Engineering",MFE:"Engineering",MSE:"Engineering",NUE:"Engineering",RBE:"Engineering",SYE:"Engineering",BUS:"Business & Management",ECON:"Business & Management",MIS:"Business & Management",OIE:"Business & Management",EN:"Humanities & Arts",HI:"Humanities & Arts",HU:"Humanities & Arts",MU:"Humanities & Arts",RE:"Humanities & Arts",SP:"Humanities & Arts",TH:"Humanities & Arts",WR:"Humanities & Arts",GOV:"Social Sciences",PSY:"Social Sciences",SOC:"Social Sciences",SS:"Social Sciences"},q=["Science","Engineering","Business & Management","Humanities & Arts","Social Sciences","Other"];function $(h){return Ee[h]||"Other"}function Me(h){const e={};return q.forEach(t=>{e[t]=[]}),h.forEach(t=>{const s=$(t.abbreviation);e[s].push(t)}),Object.keys(e).forEach(t=>{e[t].sort((s,r)=>s.name.localeCompare(r.name))}),e}class xe{constructor(){this.allDepartments=[],this.selectedDepartment=null,this.departmentSyncService=null}setDepartmentSyncService(e){this.departmentSyncService=e}setAllDepartments(e){this.allDepartments=e}getSelectedDepartment(){return this.selectedDepartment}getDepartmentById(e){return this.allDepartments.find(t=>t.abbreviation===e)||null}selectDepartment(e){const t=this.allDepartments.find(r=>r.abbreviation===e);if(!t)return null;this.selectedDepartment=t;const s=document.querySelector(".content-header h2");return s&&(s.textContent=`${t.name} Courses`),t}displayDepartments(){const e=document.getElementById("department-list");if(!e)return;const t=this.groupDepartmentsByCategory();let s="";Object.entries(t).forEach(([r,i])=>{i.length!==0&&(s+=`
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
            `)}),e.innerHTML=s}groupDepartmentsByCategory(){return Me(this.allDepartments)}handleDepartmentClick(e,t=!1){const s=this.allDepartments.find(r=>r.abbreviation===e);if(!s)return null;if(this.departmentSyncService)this.departmentSyncService.syncSidebarToFilter(e,t);else{this.selectDepartment(e),document.querySelectorAll(".department-item").forEach(i=>{i.classList.remove("active")});const r=document.querySelector(`[data-dept-id="${e}"]`);r&&r.classList.add("active")}return s}clearDepartmentSelection(){this.selectedDepartment=null,document.querySelectorAll(".department-item").forEach(s=>{s.classList.remove("active")});const e=document.querySelector(".sidebar-header h2");e&&(e.textContent="Departments");const t=document.getElementById("department-list");t&&t.classList.remove("multi-select-active")}}class Le{constructor(){this._cancelled=!1}get isCancelled(){return this._cancelled}get reason(){return this._reason}cancel(e){this._cancelled=!0,this._reason=e}throwIfCancelled(){if(this._cancelled)throw new x(this._reason||"Operation was cancelled")}}class x extends Error{constructor(e="Operation was cancelled"){super(e),this.name="CancellationError"}}class De{constructor(){this._token=new Le}get token(){return this._token}cancel(e){this._token.cancel(e)}}class $e{constructor(){this.activeOperations=new Map}startOperation(e,t){this.cancelOperation(e,t);const s=new De;return this.activeOperations.set(e,s),s.token}cancelOperation(e,t){const s=this.activeOperations.get(e);s&&(s.cancel(t||"New operation started"),this.activeOperations.delete(e))}cancelAllOperations(e){for(const[t,s]of this.activeOperations)s.cancel(e||"All operations cancelled");this.activeOperations.clear()}isOperationActive(e){return this.activeOperations.has(e)}getActiveOperationCount(){return this.activeOperations.size}completeOperation(e){this.activeOperations.delete(e)}}class Ie{constructor(e,t,s=300){this.delay=s,this.timeoutId=null,this.operationManager=e,this.operationId=t}execute(e){return new Promise((t,s)=>{this.timeoutId!==null&&clearTimeout(this.timeoutId),this.timeoutId=window.setTimeout(async()=>{try{const r=this.operationManager.startOperation(this.operationId,"Debounced operation"),i=await e(r);this.operationManager.completeOperation(this.operationId),t(i)}catch(r){if(r instanceof x)return;s(r)}},this.delay)})}cancel(){this.timeoutId!==null&&(clearTimeout(this.timeoutId),this.timeoutId=null),this.operationManager.cancelOperation(this.operationId,"Debounced operation cancelled")}setDelay(e){this.delay=Math.max(0,Math.min(5e3,e))}}class ke{constructor(e={}){this.options=e,this.batchSize=10,this.batchDelay=16,this.currentRenderToken=null,this.isRendering=!1,this.renderStartTime=0,this.batchSize=e.batchSize||10,this.batchDelay=e.batchDelay||16,this.performanceMetrics=e.performanceMetrics}async renderCoursesBatched(e,t,s,r){if(this.cancelCurrentRender(),e.length===0){t([],!0,!0);return}this.isRendering=!0,this.renderStartTime=performance.now();const i=Date.now()+Math.random();this.currentRenderToken=i;const o=Math.ceil(e.length/this.batchSize),n=this.performanceMetrics?.startOperation("batch-render",{itemCount:e.length,batchSize:this.batchSize,batchCount:o});try{r?.throwIfCancelled();const c=e.slice(0,this.batchSize);if(t(c,!0,e.length<=this.batchSize),this.options.onBatch?.(1,o,e.length),e.length<=this.batchSize){this.completeRender(e.length);return}for(let a=1;a<o;a++){if(this.currentRenderToken!==i||(r?.throwIfCancelled(),await this.wait(this.batchDelay,r),this.currentRenderToken!==i))return;r?.throwIfCancelled();const d=a*this.batchSize,l=Math.min((a+1)*this.batchSize,e.length),u=e.slice(d,l);t(u,!1,a===o-1),this.options.onBatch?.(a+1,o,e.length)}this.completeRender(e.length),n&&this.performanceMetrics?.endOperation(n,{completed:!0,cancelled:!1})}catch(c){if(c instanceof x){this.isRendering=!1,this.currentRenderToken=null,n&&this.performanceMetrics?.endOperation(n,{completed:!1,cancelled:!0});return}console.error("Progressive rendering error:",c),this.isRendering=!1,this.currentRenderToken=null,n&&this.performanceMetrics?.endOperation(n,{completed:!1,cancelled:!1,error:c.message})}}async renderCourseList(e,t,s,r,i){let o="",n=[];const c=(a,d,l)=>{d&&(s.innerHTML='<div class="course-list"></div>',o="",n=[]);const u=a.map(f=>{const v=t.isCourseSelected(f),g=this.courseHasWarning(f);return`
                    <div class="course-item ${v?"selected":""}" data-course-id="${f.id}">
                        <div class="course-header">
                            <button class="course-select-btn ${v?"selected":""}" title="${v?"Remove from selection":"Add to selection"}">
                                ${v?"✓":"+"}
                            </button>
                            <div class="course-code">${f.department.abbreviation}${f.number}</div>
                            <div class="course-details">
                                <div class="course-name">
                                    ${f.name}
                                    ${g?'<span class="warning-icon">⚠</span>':""}
                                </div>
                                <div class="course-sections">
                                    ${f.sections.map(b=>`<span class="section-badge ${b.seatsAvailable<=0?"full":""}" data-section="${b.number}">${b.number}</span>`).join("")}
                                </div>
                            </div>
                        </div>
                    </div>
                `}).join("");o+=u,n.push(...a);const m=s.querySelector(".course-list");if(m&&(m.innerHTML=o,m.querySelectorAll(".course-item").forEach((v,g)=>{g<n.length&&r.set(v,n[g])})),!l&&m){const f=document.createElement("div");f.className="loading-indicator",f.innerHTML=`
                    <div class="loading-spinner"></div>
                    <span>Loading more courses... (${n.length} of ${e.length})</span>
                `,m.appendChild(f)}};await this.renderCoursesBatched(e,c,s,i)}async renderCourseGrid(e,t,s,r,i){let o="",n=[];const c=(a,d,l)=>{d&&(s.innerHTML='<div class="course-grid"></div>',o="",n=[]);const u=a.map(f=>{const v=t.isCourseSelected(f),g=this.courseHasWarning(f),b=f.minCredits===f.maxCredits?f.minCredits:`${f.minCredits}-${f.maxCredits}`;return`
                    <div class="course-card ${v?"selected":""}" data-course-id="${f.id}">
                        <div class="course-card-header">
                            <div class="course-code">${f.department.abbreviation}${f.number}</div>
                            <button class="course-select-btn ${v?"selected":""}" title="${v?"Remove from selection":"Add to selection"}">
                                ${v?"✓":"+"}
                            </button>
                        </div>
                        <div class="course-title">
                            ${f.name}
                            ${g?'<span class="warning-icon">⚠</span>':""}
                        </div>
                        <div class="course-info">
                            <span class="course-credits">${b} credits</span>
                            <span class="course-sections-count">${f.sections.length} section${f.sections.length!==1?"s":""}</span>
                        </div>
                    </div>
                `}).join("");o+=u,n.push(...a);const m=s.querySelector(".course-grid");if(m&&(m.innerHTML=o,m.querySelectorAll(".course-card").forEach((v,g)=>{g<n.length&&r.set(v,n[g])})),!l&&m){const f=document.createElement("div");f.className="loading-indicator grid-loading",f.innerHTML=`
                    <div class="loading-spinner"></div>
                    <span>Loading more courses... (${n.length} of ${e.length})</span>
                `,m.appendChild(f)}};await this.renderCoursesBatched(e,c,s,i)}cancelCurrentRender(){this.currentRenderToken!==null&&(this.currentRenderToken=null,this.isRendering=!1)}isCurrentlyRendering(){return this.isRendering}setBatchSize(e){this.batchSize=Math.max(1,Math.min(100,e))}getBatchSize(){return this.batchSize}setBatchDelay(e){this.batchDelay=Math.max(0,Math.min(100,e))}wait(e,t){return new Promise((s,r)=>{if(t?.isCancelled){r(new x(t.reason));return}const i=setTimeout(()=>{t?.isCancelled?r(new x(t.reason)):s()},e);t?.isCancelled&&(clearTimeout(i),r(new x(t.reason)))})}courseHasWarning(e){return e.sections.every(t=>t.seatsAvailable<=0)}completeRender(e){const t=performance.now()-this.renderStartTime;this.isRendering=!1,this.currentRenderToken=null,this.options.onComplete?.(e,t)}}class Oe{constructor(){this.metrics=[],this.maxMetrics=100,this.activeOperations=new Map}startOperation(e,t){const s=`${e}_${Date.now()}_${Math.random()}`;return this.activeOperations.set(s,performance.now()),s}endOperation(e,t){const s=this.activeOperations.get(e);if(!s)return console.warn(`No start time found for operation: ${e}`),null;const r=performance.now(),i=r-s,o={operation:e.split("_")[0],startTime:s,endTime:r,duration:i,metadata:t};return this.addMetric(o),this.activeOperations.delete(e),o}trackOperation(e,t,s){const r=performance.now(),i={operation:e,startTime:r-t,endTime:r,duration:t,metadata:s};this.addMetric(i)}trackFilterOperation(e){this.trackOperation(e.operation,e.duration,{itemCount:e.itemCount,batchSize:e.batchSize,batchCount:e.batchCount,cancelled:e.cancelled})}trackRenderOperation(e,t,s,r){this.trackFilterOperation({operation:"render",itemCount:e,duration:t,batchSize:s,batchCount:r})}trackSearchOperation(e,t,s){this.trackOperation("search",s,{query:e.substring(0,50),queryLength:e.length,resultCount:t})}addMetric(e){this.metrics.push(e),this.metrics.length>this.maxMetrics&&(this.metrics=this.metrics.slice(-this.maxMetrics))}generateReport(e){let t=this.metrics;if(e&&(t=this.metrics.filter(r=>r.operation===e)),t.length===0)return{totalOperations:0,averageDuration:0,minDuration:0,maxDuration:0,operations:[]};const s=t.map(r=>r.duration);return{totalOperations:t.length,averageDuration:s.reduce((r,i)=>r+i,0)/s.length,minDuration:Math.min(...s),maxDuration:Math.max(...s),operations:t}}getRecentMetrics(e=10){return this.metrics.slice(-e)}clearMetrics(){this.metrics=[],this.activeOperations.clear()}getMetricsSummary(){const e=this.generateReport();return e.totalOperations===0?"No performance metrics collected":`Performance Summary:
- Total Operations: ${e.totalOperations}
- Average Duration: ${e.averageDuration.toFixed(2)}ms
- Min Duration: ${e.minDuration.toFixed(2)}ms
- Max Duration: ${e.maxDuration.toFixed(2)}ms`}logSummary(){console.log(this.getMetricsSummary())}isPerformanceDegraded(e,t=1e3){const s=this.generateReport(e);return s.averageDuration>t||s.maxDuration>t*2}getInsights(){const e=[],t=this.generateReport();if(t.totalOperations===0)return["No performance data available"];t.averageDuration>500&&e.push(`Average operation time (${t.averageDuration.toFixed(2)}ms) is high - consider optimization`),t.maxDuration>2e3&&e.push(`Slowest operation (${t.maxDuration.toFixed(2)}ms) is very slow - investigate bottlenecks`);const s=this.generateReport("render");s.totalOperations>0&&s.averageDuration>300&&e.push(`Rendering performance could be improved (avg: ${s.averageDuration.toFixed(2)}ms)`);const r=this.generateReport("search");return r.totalOperations>0&&r.averageDuration>200&&e.push(`Search performance could be improved (avg: ${r.averageDuration.toFixed(2)}ms)`),e.length===0&&e.push("Performance looks good!"),e}getOptimalBatchSize(e=10){const t=this.generateReport("render");if(t.totalOperations<3)return e;const s=t.averageDuration;return s<50?Math.min(e+5,50):s>200?Math.max(e-2,5):e}}class Pe{constructor(e){this.allDepartments=[],this.selectedCourse=null,this.filterService=null,this.elementToCourseMap=new WeakMap,this.courseSelectionService=e,this.performanceMetrics=new Oe;const t={batchSize:10,batchDelay:16,performanceMetrics:this.performanceMetrics,onBatch:(s,r,i)=>{console.log(`Rendered batch ${s}/${r} (${i} total courses)`)},onComplete:(s,r)=>{if(console.log(`Progressive rendering complete: ${s} courses in ${r.toFixed(2)}ms`),Math.random()<.1){const i=this.performanceMetrics.getInsights();console.log("Performance insights:",i.join(", "));const o=this.performanceMetrics.getOptimalBatchSize(this.progressiveRenderer.getBatchSize());o!==this.progressiveRenderer.getBatchSize()&&(console.log(`Adjusting batch size from ${this.progressiveRenderer.getBatchSize()} to ${o}`),this.progressiveRenderer.setBatchSize(o))}}};this.progressiveRenderer=new ke(t)}setFilterService(e){this.filterService=e}setAllDepartments(e){this.allDepartments=e}getSelectedCourse(){return this.selectedCourse}async displayCourses(e,t){return this.displayCoursesWithCancellation(e,t)}async displayCoursesWithCancellation(e,t,s){this.progressiveRenderer.cancelCurrentRender(),t==="grid"?await this.displayCoursesGrid(e,s):await this.displayCoursesList(e,s)}async displayCoursesList(e,t){const s=document.getElementById("course-container");if(!s)return;if(e.length===0){s.innerHTML='<div class="empty-state">No courses found in this department.</div>';return}const r=e.sort((i,o)=>i.number.localeCompare(o.number));await this.progressiveRenderer.renderCourseList(r,this.courseSelectionService,s,this.elementToCourseMap,t)}async displayCoursesGrid(e,t){const s=document.getElementById("course-container");if(!s)return;if(e.length===0){s.innerHTML='<div class="empty-state">No courses found in this department.</div>';return}const r=e.sort((i,o)=>i.number.localeCompare(o.number));await this.progressiveRenderer.renderCourseGrid(r,this.courseSelectionService,s,this.elementToCourseMap,t)}courseHasWarning(e){return e.sections.every(t=>t.seatsAvailable<=0)}handleSearch(e,t){const s=t?t.courses:this.getAllCourses();if(this.filterService){const i=this.filterService.searchAndFilter(e,s);return this.updateSearchHeader(e,i.length,t),i}if(!e.trim())return s;const r=s.filter(i=>i.name.toLowerCase().includes(e.toLowerCase())||i.number.toLowerCase().includes(e.toLowerCase())||i.id.toLowerCase().includes(e.toLowerCase()));return this.updateSearchHeader(e,r.length,t),r}handleFilter(e){const t=e?e.courses:this.getAllCourses();if(this.filterService&&!this.filterService.isEmpty()){const s=this.filterService.filterCourses(t);return this.updateFilterHeader(s.length,e),s}return t}getAllCourses(){const e=[];return this.allDepartments.forEach(t=>{e.push(...t.courses)}),e}updateSearchHeader(e,t,s){const r=document.querySelector(".content-header h2");r&&(e.trim()?r.textContent=`Search Results (${t})`:s?r.textContent=`${s.name} (${t})`:r.textContent=`All Courses (${t})`)}updateFilterHeader(e,t){const s=document.querySelector(".content-header h2");if(s){let r=t?t.name:"All Courses";if(this.filterService&&!this.filterService.isEmpty()){const i=this.filterService.getFilterSummary();r+=` (${e}) - ${i}`}else r+=` (${e})`;s.textContent=r}}selectCourse(e){const t=this.elementToCourseMap.get(e);return t?(this.selectedCourse=t,this.displayCourseDescription(t),document.querySelectorAll(".course-item, .course-card").forEach(s=>{s.classList.remove("active")}),e.classList.add("active"),t):null}selectCourseById(e){if(!this.courseSelectionService.findCourseById(e))return null;const s=document.querySelectorAll(".course-item, .course-card");for(const r of s)if(this.elementToCourseMap.get(r)?.id===e)return this.selectCourse(r);return null}toggleCourseSelection(e){const t=this.elementToCourseMap.get(e);if(!t)return!1;const s=this.courseSelectionService.toggleCourseSelection(t);return this.updateCourseSelectionUI(e,s),s}toggleCourseSelectionById(e){if(!this.courseSelectionService.findCourseById(e))return!1;const s=document.querySelectorAll(".course-item, .course-card");for(const r of s)if(this.elementToCourseMap.get(r)?.id===e)return this.toggleCourseSelection(r);return!1}updateCourseSelectionUI(e,t){const s=e.querySelector(".course-select-btn");s&&(t?(e.classList.add("selected"),s.textContent="✓",s.classList.add("selected")):(e.classList.remove("selected"),s.textContent="+",s.classList.remove("selected")))}refreshCourseSelectionUI(){document.querySelectorAll(".course-item, .course-card").forEach(e=>{const t=this.elementToCourseMap.get(e);if(t){const s=this.courseSelectionService.isCourseSelected(t);this.updateCourseSelectionUI(e,s)}})}displayCourseDescription(e){const t=document.getElementById("course-description");if(!t)return;const s=`
            <div class="course-info">
                <div class="course-title">${e.name}</div>
                <div class="course-code">${e.department.abbreviation}${e.number} (${e.minCredits===e.maxCredits?e.minCredits:`${e.minCredits}-${e.maxCredits}`} credits)</div>
            </div>
            <div class="course-description-text">${e.description}</div>
        `;t.innerHTML=s}clearCourseDescription(){const e=document.getElementById("course-description");e&&(e.innerHTML='<div class="empty-state">Select a course to view description</div>')}clearCourseSelection(){this.selectedCourse=null,this.clearCourseDescription()}displaySelectedCourses(){const e=document.getElementById("selected-courses-list"),t=document.getElementById("selected-count");if(!e||!t)return;const s=this.courseSelectionService.getSelectedCourses();if(t.textContent=`(${s.length})`,s.length===0){e.innerHTML='<div class="empty-state">No courses selected yet</div>';return}const r=s.sort((n,c)=>{const a=n.course.department.abbreviation.localeCompare(c.course.department.abbreviation);return a!==0?a:n.course.number.localeCompare(c.course.number)});let i="";r.forEach(n=>{const c=n.course,a=c.minCredits===c.maxCredits?`${c.minCredits} credits`:`${c.minCredits}-${c.maxCredits} credits`;i+=`
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
            `}),e.innerHTML=i,e.querySelectorAll(".course-remove-btn").forEach((n,c)=>{this.elementToCourseMap.set(n,r[c].course)})}getCourseFromElement(e){return this.elementToCourseMap.get(e)}}const S=class S{static timeToGridRow(e){return S.timeToGridRowStart(e)}static timeToGridRowStart(e){const t=e.hours*60+e.minutes,s=S.START_HOUR*60,r=t-s,i=Math.floor(r/30);return Math.max(0,Math.min(i,S.TOTAL_TIME_SLOTS-1))}static timeToGridRowEnd(e){const t=e.hours*60+e.minutes,s=S.START_HOUR*60,r=t-s,i=Math.ceil(r/30);return Math.max(0,Math.min(i,S.TOTAL_TIME_SLOTS-1))}static dayToGridColumn(e){return S.DAYS_ORDER.indexOf(e)}static calculateDuration(e,t){const s=S.timeToGridRow(e),r=S.timeToGridRow(t);return Math.max(1,r-s)}static isTimeInBounds(e){return e.hours>=S.START_HOUR&&e.hours<S.END_HOUR}static formatTime(e){if(e.displayTime)return e.displayTime;const t=e.hours===0?12:e.hours>12?e.hours-12:e.hours,s=e.hours>=12?"PM":"AM",r=e.minutes.toString().padStart(2,"0");return`${t}:${r} ${s}`}static formatTimeRange(e,t){const s=S.formatTime(e),r=S.formatTime(t);return e.hours<12&&t.hours<12?`${s.replace(" AM","")}-${r}`:e.hours>=12&&t.hours>=12?`${s.replace(" PM","")}-${r}`:`${s}-${r}`}static formatDays(e){const t={[p.MONDAY]:"M",[p.TUESDAY]:"T",[p.WEDNESDAY]:"W",[p.THURSDAY]:"R",[p.FRIDAY]:"F",[p.SATURDAY]:"S",[p.SUNDAY]:"U"};return S.DAYS_ORDER.filter(s=>e.has(s)).map(s=>t[s]).join("")}static generateTimeLabels(){const e=[];for(let t=0;t<S.TOTAL_TIME_SLOTS;t++){const s=Math.floor(t/S.SLOTS_PER_HOUR)+S.START_HOUR,r=t%S.SLOTS_PER_HOUR*30;e.push(S.formatTime({hours:s,minutes:r,displayTime:""}))}return e}static getDayName(e){return{[p.MONDAY]:"Monday",[p.TUESDAY]:"Tuesday",[p.WEDNESDAY]:"Wednesday",[p.THURSDAY]:"Thursday",[p.FRIDAY]:"Friday",[p.SATURDAY]:"Saturday",[p.SUNDAY]:"Sunday"}[e]}static getDayAbbr(e){return{[p.MONDAY]:"Mon",[p.TUESDAY]:"Tue",[p.WEDNESDAY]:"Wed",[p.THURSDAY]:"Thu",[p.FRIDAY]:"Fri",[p.SATURDAY]:"Sat",[p.SUNDAY]:"Sun"}[e]}};S.START_HOUR=7,S.END_HOUR=19,S.TOTAL_HOURS=12,S.SLOTS_PER_HOUR=2,S.TOTAL_TIME_SLOTS=S.TOTAL_HOURS*S.SLOTS_PER_HOUR,S.DAYS_ORDER=[p.MONDAY,p.TUESDAY,p.WEDNESDAY,p.THURSDAY,p.FRIDAY,p.SATURDAY,p.SUNDAY];let C=S;class Re{constructor(e){this.scheduleFilterService=null,this.scheduleManagementService=null,this.scheduleFilterModalController=null,this.sectionInfoModalController=null,this.conflictDetector=null,this.elementToCourseMap=new WeakMap,this.courseSelectionService=e}setSectionInfoModalController(e){this.sectionInfoModalController=e}setConflictDetector(e){this.conflictDetector=e,this.scheduleFilterService&&this.scheduleFilterService.setConflictDetector(e)}setScheduleFilterService(e){this.scheduleFilterService=e,this.conflictDetector&&this.scheduleFilterService.setConflictDetector(this.conflictDetector),this.scheduleFilterService.addEventListener(()=>{this.applyFiltersAndRefresh()})}setScheduleFilterModalController(e){this.scheduleFilterModalController=e}setScheduleManagementService(e){this.scheduleManagementService=e}setStatePreserver(e){this.statePreserver=e}displayScheduleSelectedCourses(){console.log("🔍 displayScheduleSelectedCourses() called");const e=document.getElementById("schedule-selected-courses"),t=document.getElementById("schedule-selected-count");if(!e||!t){console.log("❌ Missing DOM elements - selectedCoursesContainer or countElement not found");return}const s=this.statePreserver?.preserve();let r=this.courseSelectionService.getSelectedCourses();console.log(`📊 CourseSelectionService reports ${r.length} selected courses`);let i=[],o=!1;if(this.scheduleFilterService&&!this.scheduleFilterService.isEmpty()&&(i=this.scheduleFilterService.filterSections(r),o=!0,console.log(`🔎 Filters active: ${i.length} sections match filters`)),r.length===0){console.log("⚠️ Early return: 0 selected courses - displaying empty state"),t.textContent="(0)",e.innerHTML='<div class="empty-state">No courses selected yet</div>';return}if(o&&i.length===0){console.log("⚠️ Early return: 0 sections match active filters - displaying empty state"),t.textContent="(0 sections match filters)",e.innerHTML='<div class="empty-state">No sections match the current filters</div>';return}let n="";if(o){n=this.buildFilteredSectionsHTML(i,r,s);const a=new Set(i.map(d=>d.course.course.id)).size;t.textContent=`(${i.length} sections in ${a} courses)`}else{const a=r.sort((d,l)=>{const u=d.course.department.abbreviation.localeCompare(l.course.department.abbreviation);return u!==0?u:d.course.number.localeCompare(l.course.number)});n=this.buildAllCoursesHTML(a),t.textContent=`(${r.length})`}if(e.innerHTML=n,o)this.setupFilteredDOMElementMapping(e,i);else{const a=r.sort((d,l)=>{const u=d.course.department.abbreviation.localeCompare(l.course.department.abbreviation);return u!==0?u:d.course.number.localeCompare(l.course.number)});this.setupDOMElementMapping(e,a)}s&&this.statePreserver?.restore(s);const c=e.querySelectorAll(".schedule-course-item").length;console.log("✅ displayScheduleSelectedCourses() completed successfully"),console.log(`📈 Final result: ${c} schedule-course-items displayed for ${r.length} selected courses`)}buildFilteredSectionsHTML(e,t,s){const r=new Map;e.forEach(n=>{const c=n.course.course.id;r.has(c)||r.set(c,{selectedCourse:n.course,sections:[]}),r.get(c).sections.push(n.section)});let i="";return Array.from(r.entries()).sort((n,c)=>{const a=n[1].selectedCourse.course,d=c[1].selectedCourse.course,l=a.department.abbreviation.localeCompare(d.department.abbreviation);return l!==0?l:a.number.localeCompare(d.number)}).forEach(([n,c])=>{const a=c.selectedCourse,d=c.sections,l=a.course,u=s?.has(l.id)?s.get(l.id):!0;i+=this.buildCourseHeaderHTML(l,a,u),i+='<div class="schedule-sections-container">';const m={};d.forEach(v=>{m[v.computedTerm]||(m[v.computedTerm]=[]),m[v.computedTerm].push({section:v,filteredPeriods:v.periods})}),Object.keys(m).sort().forEach(v=>{i+=`<div class="term-sections" data-term="${v}">`,i+=`<div class="term-label">${v} Term</div>`,m[v].forEach(g=>{const b=g.section,L=g.filteredPeriods,T=a.selectedSectionNumber===b.number,D=T?"selected":"";i+=`
                        <div class="section-option ${D} filtered-section" data-section="${b.number}">
                            <div class="section-info">
                                <div class="section-number">${b.number}</div>
                                <div class="section-periods">`,[...L].sort((A,P)=>{const k=R=>{const E=R.toLowerCase();return E.includes("lec")||E.includes("lecture")?1:E.includes("lab")?2:E.includes("dis")||E.includes("discussion")||E.includes("rec")?3:4};return k(A.type)-k(P.type)}).forEach(A=>{const P=C.formatTimeRange(A.startTime,A.endTime),k=C.formatDays(A.days),R=this.getPeriodTypeLabel(A.type);i+=`
                            <div class="period-info highlighted-period" data-period-type="${A.type.toLowerCase()}">
                                <div class="period-header">
                                    <span class="period-type-label">${R}</span>
                                    <span class="period-schedule">${k} ${P}</span>
                                </div>
                            </div>
                        `}),i+=`
                                </div>
                            </div>
                            <button class="section-select-btn ${D}" data-section="${b.number}">
                                ${T?"✓":"+"}
                            </button>
                        </div>
                    `}),i+="</div>"}),i+="</div></div>"}),i}buildCourseHeaderHTML(e,t,s=!1){const r=e.minCredits===e.maxCredits?`${e.minCredits} credits`:`${e.minCredits}-${e.maxCredits} credits`;return`
            <div class="schedule-course-item ${s?"expanded":"collapsed"}">
                <div class="schedule-course-header dropdown-trigger">
                    <div class="schedule-course-info">
                        <div class="schedule-course-code">${e.department.abbreviation}${e.number}</div>
                        <div class="schedule-course-name">${e.name}</div>
                        <div class="schedule-course-credits">${r}</div>
                    </div>
                    <div class="header-controls">
                        <span class="dropdown-arrow">▼</span>
                        <button class="course-remove-btn" title="Remove from selection">
                            ×
                        </button>
                    </div>
                </div>
        `}buildAllCoursesHTML(e){let t="";return e.forEach(s=>{const r=s.course;t+=this.buildCourseHeaderHTML(r,s);const i={};r.sections.forEach(n=>{i[n.computedTerm]||(i[n.computedTerm]=[]),i[n.computedTerm].push(n)}),t+='<div class="schedule-sections-container">',Object.keys(i).sort().forEach(n=>{t+=`<div class="term-sections" data-term="${n}">`,t+=`<div class="term-label">${n} Term</div>`,i[n].forEach(c=>{const a=s.selectedSectionNumber===c.number,d=a?"selected":"",l=[...c.periods].sort((u,m)=>{const f=v=>{const g=v.toLowerCase();return g.includes("lec")||g.includes("lecture")?1:g.includes("lab")?2:g.includes("dis")||g.includes("discussion")||g.includes("rec")?3:4};return f(u.type)-f(m.type)});t+=`
                        <div class="section-option ${d}"  data-section="${c.number}">
                            <div class="section-info">
                                <div class="section-number">${c.number}</div>
                                <div class="section-periods">`,l.forEach((u,m)=>{const f=C.formatTimeRange(u.startTime,u.endTime),v=C.formatDays(u.days),g=this.getPeriodTypeLabel(u.type);t+=`
                            <div class="period-info" data-period-type="${u.type.toLowerCase()}">
                                <div class="period-header">
                                    <span class="period-type-label">${g}</span>
                                    <span class="period-schedule">${v} ${f}</span>
                                </div>
                            </div>
                        `}),t+=`
                                </div>
                            </div>
                            <button class="section-select-btn ${d}" data-section="${c.number}">
                                ${a?"✓":"+"}
                            </button>
                        </div>
                    `}),t+="</div>"}),t+="</div></div>"}),t}setupDOMElementMapping(e,t){const s=e.querySelectorAll(".schedule-course-item"),r=e.querySelectorAll(".course-remove-btn");s.forEach((o,n)=>{const c=t[n]?.course;this.elementToCourseMap.set(o,c)}),r.forEach((o,n)=>{const c=t[n]?.course;this.elementToCourseMap.set(o,c)}),e.querySelectorAll(".section-select-btn").forEach(o=>{const n=o.closest(".schedule-course-item");if(n){const c=Array.from(s).indexOf(n);if(c>=0&&c<t.length){const a=t[c].course;this.elementToCourseMap.set(o,a)}}})}setupFilteredDOMElementMapping(e,t){const s=e.querySelectorAll(".schedule-course-item"),r=e.querySelectorAll(".course-remove-btn"),i=[],o=new Set;t.forEach(c=>{const a=c.course.course.id;o.has(a)||(o.add(a),i.push(c.course))}),i.sort((c,a)=>{const d=c.course.department.abbreviation.localeCompare(a.course.department.abbreviation);return d!==0?d:c.course.number.localeCompare(a.course.number)}),s.forEach((c,a)=>{const d=i[a]?.course;this.elementToCourseMap.set(c,d)}),r.forEach((c,a)=>{const d=i[a]?.course;this.elementToCourseMap.set(c,d)}),e.querySelectorAll(".section-select-btn").forEach(c=>{const a=c.closest(".schedule-course-item");if(a){const d=Array.from(s).indexOf(a);if(d>=0&&d<i.length){const l=i[d].course;this.elementToCourseMap.set(c,l)}}})}handleSectionSelection(e,t){this.courseSelectionService.getSelectedSection(e)===t?this.courseSelectionService.setSelectedSection(e,null):this.courseSelectionService.setSelectedSection(e,t)}updateSectionButtonStates(e,t){let s=null;if(document.querySelectorAll(".schedule-course-item").forEach(n=>{const c=this.elementToCourseMap.get(n);c&&c.id===e.id&&(s=n)}),!s)return;const r=s,i=r.querySelectorAll(".section-select-btn"),o=r.querySelectorAll(".section-option");i.forEach(n=>{n.dataset.section===t?(n.classList.add("selected"),n.textContent="✓"):(n.classList.remove("selected"),n.textContent="+")}),o.forEach(n=>{n.dataset.section===t?n.classList.add("selected"):n.classList.remove("selected")})}renderScheduleGrids(){const e=this.courseSelectionService.getSelectedCourses();["A","B","C","D"].forEach(s=>{const r=document.getElementById(`schedule-grid-${s}`);if(!r)return;const i=e.filter(o=>o.selectedSection!==null?o.selectedSection.computedTerm===s:!1);if(i.length===0){const o=e.filter(n=>!n.selectedSection);this.renderEmptyGrid(r,s,o.length>0);return}this.renderPopulatedGrid(r,i,s)})}renderEmptyGrid(e,t,s=!1){const r=s?`No sections selected for ${t} term<br><small>Select specific sections in the left panel to see schedule</small>`:`No classes scheduled for ${t} term`;e.innerHTML=`
            <div class="empty-schedule">
                <div class="empty-message">${r}</div>
            </div>
        `,e.classList.add("empty")}renderPopulatedGrid(e,t,s){e.classList.remove("empty");const r=[p.MONDAY,p.TUESDAY,p.WEDNESDAY,p.THURSDAY,p.FRIDAY],i=C.TOTAL_TIME_SLOTS;let o="";o+='<div class="time-label"></div>',r.forEach(n=>{o+=`<div class="day-header">${C.getDayAbbr(n)}</div>`});for(let n=0;n<i;n++){const c=Math.floor(n/C.SLOTS_PER_HOUR)+C.START_HOUR,a=n%C.SLOTS_PER_HOUR*30,d=C.formatTime({hours:c,minutes:a,displayTime:""});o+=`<div class="time-label">${d}</div>`,r.forEach(l=>{const u=this.getCellContent(t,l,n);o+=`<div class="schedule-cell ${u.classes}" data-day="${l}" data-slot="${n}" style="position: relative;">${u.content}</div>`})}e.innerHTML=o,this.addSectionBlockEventListeners(e)}getCellContent(e,t,s){const r=[];for(const u of e){if(!u.selectedSection)continue;const m=u.selectedSection,f=m.periods.filter(T=>T.days.has(t));let v=!1,g=1/0,b=-1,L=!1;for(const T of f){const D=C.timeToGridRowStart(T.startTime),O=C.timeToGridRowEnd(T.endTime);s>=D&&s<O&&(v=!0,g=Math.min(g,D),b=Math.max(b,O))}v&&(L=s===g,r.push({course:u,section:m,periodsOnThisDay:f,startSlot:g,endSlot:b,isFirstSlot:L}))}if(r.length===0)return{content:"",classes:""};const i=r.length>1,o=r[0],n=this.getCourseColor(o.course.course.id),a=(o.endSlot-o.startSlot)*30,d=o.isFirstSlot?`
            <div class="section-block ${i?"conflict":""}" 
                 data-course-id="${o.course.course.id}"
                 data-section-number="${o.course.selectedSectionNumber||""}"
                 data-selected-course-index="${o.courseIndex||0}"
                 style="
                background-color: ${n}; 
                height: ${a}px;
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
                ${o.course.course.department.abbreviation}${o.course.course.number}
            </div>
        `:"",l=o.isFirstSlot?`occupied section-start ${i?"has-conflict":""}`:"";return{content:d,classes:l}}formatSectionPeriods(e){if(e.length===0)return"";const t={};for(const o of e){const n=this.getPeriodTypeLabel(o.type);t[n]||(t[n]=[]),t[n].push(o)}const s=[],r=["LEC","LAB","DIS","REC","SEM","STU","CONF"],i=Object.keys(t).sort((o,n)=>{const c=r.indexOf(o),a=r.indexOf(n);return(c===-1?999:c)-(a===-1?999:a)});for(const o of i){const c=t[o].map(a=>C.formatTimeRange(a.startTime,a.endTime)).join(", ");s.push(`<div class="period-type-info">
                <span class="period-type">${o}</span>
                <span class="period-times">${c}</span>
            </div>`)}return s.join("")}getCourseColor(e){const t=["#4CAF50","#2196F3","#FF9800","#9C27B0","#F44336","#00BCD4","#795548","#607D8B","#3F51B5","#E91E63"];let s=0;for(let r=0;r<e.length;r++)s=e.charCodeAt(r)+((s<<5)-s);return t[Math.abs(s)%t.length]}getPeriodTypeLabel(e){const t=e.toLowerCase();return t.includes("lec")||t.includes("lecture")?"LEC":t.includes("lab")?"LAB":t.includes("dis")||t.includes("discussion")?"DIS":t.includes("rec")||t.includes("recitation")?"REC":t.includes("sem")||t.includes("seminar")?"SEM":t.includes("studio")?"STU":t.includes("conference")||t.includes("conf")?"CONF":e.substring(0,Math.min(4,e.length)).toUpperCase()}getPeriodTypeClass(e){const t=e.toLowerCase();return t.includes("lec")||t.includes("lecture")?"period-lecture":t.includes("lab")?"period-lab":t.includes("dis")||t.includes("discussion")?"period-discussion":t.includes("rec")||t.includes("recitation")?"period-recitation":t.includes("sem")||t.includes("seminar")?"period-seminar":t.includes("studio")?"period-studio":t.includes("conference")||t.includes("conf")?"period-conference":"period-other"}getCourseFromElement(e){return this.elementToCourseMap.get(e)}applyFiltersAndRefresh(){this.displayScheduleSelectedCourses(),this.updateScheduleFilterButtonState()}updateScheduleFilterButtonState(){const e=document.getElementById("schedule-filter-btn");if(e&&this.scheduleFilterService){const t=!this.scheduleFilterService.isEmpty(),s=this.scheduleFilterService.getFilterCount();t?(e.classList.add("active"),e.title=`${s} filter${s===1?"":"s"} active - Click to modify`):(e.classList.remove("active"),e.title="Filter selected courses")}}addSectionBlockEventListeners(e){e.addEventListener("click",t=>{const r=t.target.closest(".section-block");if(!r)return;const i=r.dataset.courseId,o=r.dataset.sectionNumber;i&&o&&(t.stopPropagation(),this.showSectionInfoModal(i,o))})}showSectionInfoModal(e,t){if(!this.sectionInfoModalController){console.warn("Section info modal controller not available");return}const r=this.courseSelectionService.getSelectedCourses().find(c=>c.course.id===e);if(!r||!r.selectedSection){console.warn("Course or section not found:",e,t);return}const i=r.course,o=r.selectedSection,n={courseCode:`${i.department.abbreviation}${i.number}`,courseName:i.name,section:o,course:i};this.sectionInfoModalController.show(n)}}class Be{constructor(e){this.modalService=e}show(e){const t=this.modalService.generateId(),s=this.createModalElement(t,e);return this.modalService.showModal(t,s),this.modalService.setupModalBehavior(s,t),t}createModalElement(e,t){const s=document.createElement("div");s.className="modal-backdrop",s.id=e;const r=document.createElement("style");r.textContent=this.getModalCSS(),s.appendChild(r),s.innerHTML+=`
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
        `;const i=s.querySelector(".modal-dialog");return i&&i.addEventListener("click",o=>{o.stopPropagation()}),s}generateModalBody(e){const t=e.section.seatsAvailable>0?`${e.section.seatsAvailable} seats available`:"Full",s=e.section.maxWaitlist>0?`Waitlist: ${e.section.actualWaitlist}/${e.section.maxWaitlist}`:"",r=e.section.periods.map(i=>{const n=Array.from(i.days).sort().join(", ").toUpperCase(),c=`${i.startTime.displayTime} - ${i.endTime.displayTime}`,a=i.building&&i.room?`${i.building} ${i.room}`:i.location||"TBA";return`
                <div class="period-info">
                    <div class="period-type">${this.getPeriodTypeLabel(i.type)}</div>
                    <div class="period-schedule">
                        <div>${n} ${c}</div>
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
        `}}class He{constructor(e){this.modalService=e}show(e,t,s="info"){const r=this.modalService.generateId(),i=this.createModalElement(r,e,t,s);return this.modalService.showModal(r,i),this.modalService.setupModalBehavior(i,r),r}showInfo(e,t){return this.show(e,t,"info")}showWarning(e,t){return this.show(e,t,"warning")}showError(e,t){return this.show(e,t,"error")}showSuccess(e,t){return this.show(e,t,"success")}createModalElement(e,t,s,r){const i=document.createElement("div");i.className="modal-backdrop",i.id=e;const o=document.createElement("style");o.textContent=this.getModalCSS(),i.appendChild(o),i.innerHTML+=`
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
        `;const n=i.querySelector(".modal-dialog");return n&&n.addEventListener("click",c=>{c.stopPropagation()}),i}getIconForType(e){switch(e){case"info":return"ℹ";case"warning":return"⚠";case"error":return"✖";case"success":return"✓";default:return"ℹ"}}getButtonStyleForType(e){switch(e){case"error":return"danger";case"warning":return"warning";case"success":return"success";case"info":default:return"primary"}}getModalCSS(){return`
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
        `}}class Ne{constructor(e){this.filterService=null,this.allCourses=[],this.allDepartments=[],this.currentModalId=null,this.isCategoryMode=!1,this.isUpdatingFilter=!1,this.modalService=e}setFilterService(e){this.filterService=e}setCourseData(e){this.allDepartments=e,this.allCourses=[],e.forEach(t=>{this.allCourses.push(...t.courses)})}syncSearchInputFromMain(e){if(this.currentModalId){const t=document.getElementById(this.currentModalId);if(t){const s=t.querySelector(".search-text-input");s&&s.value!==e&&(s.value=e,this.updateClearSearchButton(t,e))}}}refreshDepartmentSelection(){if(!this.isUpdatingFilter&&this.currentModalId){const e=document.getElementById(this.currentModalId);e&&this.updateDepartmentCheckboxes(e)}}updateDepartmentCheckboxes(e){if(!this.filterService)return;const s=this.filterService.getActiveFilters().find(i=>i.id==="department")?.criteria?.departments||[];e.querySelectorAll('input[data-filter="department"]').forEach(i=>{if(this.isCategoryMode&&i.dataset.category==="true"){const o=i.value,c=this.filterService.getFilterOptions("department",this.allCourses).filter(u=>$(u)===o),a=c.filter(u=>s.includes(u));i.checked=a.length>0;const d=a.length===c.length,l=a.length>0;i.indeterminate=l&&!d}else i.checked=s.includes(i.value)}),this.updatePreview(e)}show(){if(!this.filterService)return console.error("FilterService not set on FilterModalController"),"";const e=this.modalService.generateId();this.currentModalId=e;const t=this.createModalElement(e);return this.modalService.showModal(e,t),this.modalService.setupModalBehavior(t,e,{closeOnBackdrop:!0,closeOnEscape:!0}),setTimeout(()=>this.initializeFilterUI(t),50),e}createModalElement(e){const t=document.createElement("div");t.className="modal-backdrop filter-modal",t.id=e;const s=this.filterService?.getFilterCount()||0,r=this.filterService?this.filterService.filterCourses(this.allCourses).length:this.allCourses.length;t.innerHTML=`
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
        `}createDepartmentFilter(){if(!this.filterService)return"";const e=this.isCategoryMode?this.createCategoryCheckboxes():this.createIndividualDepartmentCheckboxes(),t=this.isCategoryMode?"Search categories...":"Search departments...";return`
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Departments</h4>
                    <div class="filter-section-actions">
                        <button class="filter-select-all" data-filter="department">All</button>
                        <button class="filter-select-none" data-filter="department">None</button>
                    </div>
                </div>
                <div class="filter-section-content">
                    <div class="filter-toggle-container">
                        <label class="filter-toggle-label">
                            <input type="checkbox" class="filter-toggle" ${this.isCategoryMode?"checked":""} 
                                   id="category-mode-toggle">
                            <span class="filter-toggle-slider"></span>
                            <span class="filter-toggle-text">Search by Credit Requirements</span>
                        </label>
                    </div>
                    <div class="filter-search-container">
                        <input type="text" class="filter-search" placeholder="${t}" data-filter="department">
                    </div>
                    <div class="filter-checkbox-grid" id="department-checkboxes">
                        ${e}
                    </div>
                </div>
            </div>
        `}createIndividualDepartmentCheckboxes(){if(!this.filterService)return"";const e=this.filterService.getFilterOptions("department",this.allCourses),s=this.filterService.getActiveFilters().find(r=>r.id==="department")?.criteria?.departments||[];return e.map(r=>`
            <label class="filter-checkbox-label">
                <input type="checkbox" value="${r}" ${s.includes(r)?"checked":""} 
                       data-filter="department">
                <span class="filter-checkbox-text">${r}</span>
            </label>
        `).join("")}createAvailabilityFilter(){return this.filterService?`
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
        `}initializeFilterUI(e){this.filterService&&(this.setupSearchTextFilter(e),this.setupDepartmentFilter(e),this.setupAvailabilityFilter(e),this.setupCreditRangeFilter(e),this.setupProfessorFilter(e),this.setupTermFilter(e),this.setupLocationFilter(e),this.setupClearAllButton(e),this.setupFilterSearch(e))}setupSearchTextFilter(e){const t=e.querySelector(".search-text-input"),s=e.querySelector(".filter-clear-search");t&&t.addEventListener("input",()=>{const r=t.value.trim();this.updateSearchTextFilter(r,e),this.syncMainSearchInput(r)}),s&&s.addEventListener("click",()=>{t&&(t.value=""),this.updateSearchTextFilter("",e),this.syncMainSearchInput("")})}setupDepartmentFilter(e){const t=e.querySelector("#category-mode-toggle");t&&t.addEventListener("change",()=>{this.toggleDepartmentMode(e)});const s=e.querySelectorAll('input[data-filter="department"]');this.isCategoryMode&&s.forEach(o=>{const n=o;n.dataset.indeterminate==="true"&&(n.indeterminate=!0)}),s.forEach(o=>{o.addEventListener("change",()=>{this.updateDepartmentFilter(e)})});const r=e.querySelector('.filter-select-all[data-filter="department"]'),i=e.querySelector('.filter-select-none[data-filter="department"]');r?.addEventListener("click",()=>{s.forEach(o=>o.checked=!0),this.updateDepartmentFilter(e)}),i?.addEventListener("click",()=>{s.forEach(o=>o.checked=!1),this.updateDepartmentFilter(e)})}setupAvailabilityFilter(e){e.querySelector('input[data-filter="availability"]')?.addEventListener("change",()=>this.updateAvailabilityFilter(e))}setupCreditRangeFilter(e){const t=e.querySelector("#credit-min"),s=e.querySelector("#credit-max"),r=e.querySelectorAll(".filter-quick-btn");t?.addEventListener("change",()=>this.updateCreditRangeFilter(e)),s?.addEventListener("change",()=>this.updateCreditRangeFilter(e)),r.forEach(i=>{i.addEventListener("click",o=>{const n=o.target.dataset.credits;if(n?.includes("-")){const[c,a]=n.split("-");t&&(t.value=c),s&&(s.value=a)}else t&&(t.value=n),s&&(s.value=n);this.updateCreditRangeFilter(e)})})}setupProfessorFilter(e){const t=e.querySelector(".professor-search"),s=e.querySelector("#professor-dropdown");if(t&&this.filterService){const i=this.filterService.getFilterOptions("professor",this.allCourses);t.addEventListener("input",()=>{const o=t.value.toLowerCase();if(o.length>0){const n=i.filter(c=>c.toLowerCase().includes(o)&&c!=="TBA").slice(0,10);s.innerHTML=n.map(c=>`<div class="professor-option" data-professor="${c}">${c}</div>`).join(""),s.style.display=n.length>0?"block":"none"}else s.style.display="none"}),document.addEventListener("click",o=>{!t.contains(o.target)&&!s.contains(o.target)&&(s.style.display="none")}),s.addEventListener("click",o=>{const n=o.target;if(n.classList.contains("professor-option")){const c=n.dataset.professor;this.addProfessorFilter(c,e),t.value="",s.style.display="none"}})}const r=e.querySelector(".filter-selected-chips");r&&r.addEventListener("click",i=>{const o=i.target;if(o.classList.contains("filter-chip-remove")){i.stopPropagation(),i.preventDefault();const n=this.unescapeHtml(o.dataset.professor);this.removeProfessorFilter(n,e)}})}setupTermFilter(e){const t=e.querySelectorAll('input[data-filter="term"]');t.forEach(r=>{r.addEventListener("change",()=>this.updateTermFilter(e))}),e.querySelector('.filter-select-all[data-filter="term"]')?.addEventListener("click",()=>{t.forEach(r=>r.checked=!0),this.updateTermFilter(e)})}setupLocationFilter(e){const t=e.querySelectorAll('input[data-filter="location"]');t.forEach(i=>{i.addEventListener("change",()=>this.updateLocationFilter(e))});const s=e.querySelector('.filter-select-all[data-filter="location"]'),r=e.querySelector('.filter-select-none[data-filter="location"]');s?.addEventListener("click",()=>{t.forEach(i=>i.checked=!0),this.updateLocationFilter(e)}),r?.addEventListener("click",()=>{t.forEach(i=>i.checked=!1),this.updateLocationFilter(e)})}setupClearAllButton(e){e.querySelector("#clear-all-filters")?.addEventListener("click",()=>{if(this.filterService){this.filterService.clearFilters(),this.updatePreview(e),this.syncMainSearchInput("");const s=e.querySelector(".filter-modal-body");s&&(s.innerHTML=this.createFilterSections(),this.initializeFilterUI(e))}})}setupFilterSearch(e){e.querySelectorAll(".filter-search").forEach(s=>{s.addEventListener("input",r=>{const i=r.target,o=i.dataset.filter,n=i.value.toLowerCase();if(o==="department"){const c=e.querySelector("#department-checkboxes");c&&c.querySelectorAll(".filter-checkbox-label").forEach(d=>{const l=d.querySelector('input[type="checkbox"]'),u=l?l.value:"";let m=!1;this.isCategoryMode?m=u.toLowerCase().includes(n):m=this.departmentMatchesSearch(u,n),d.style.display=m?"flex":"none"})}})})}updateSearchTextFilter(e,t){e.length>0?this.filterService?.addFilter("searchText",{query:e}):this.filterService?.removeFilter("searchText"),this.updatePreview(t),this.updateClearSearchButton(t,e)}syncMainSearchInput(e){const t=document.getElementById("search-input");t&&(t.value=e)}updateClearSearchButton(e,t){const s=e.querySelector(".filter-clear-search");s&&(s.style.display=t.length>0?"inline-block":"none")}departmentMatchesSearch(e,t){if(!t)return!0;const s=t.toLowerCase();return!!(e.toLowerCase().includes(s)||$(e).toLowerCase().includes(s))}toggleDepartmentMode(e){this.isCategoryMode=!this.isCategoryMode;const t=e.querySelectorAll(".filter-section");let s=null;if(t.forEach(r=>{r.querySelector(".filter-section-title")?.textContent==="Departments"&&(s=r)}),s){const r=this.createDepartmentFilter();s.outerHTML=r;const i=document.getElementById(this.currentModalId||"");i&&(this.setupDepartmentFilter(i),this.setupFilterSearch(i))}}createCategoryCheckboxes(){if(!this.filterService)return"";const t=this.filterService.getActiveFilters().find(o=>o.id==="department")?.criteria?.departments||[],s=this.filterService.getFilterOptions("department",this.allCourses);return q.filter(o=>o!=="Other").map(o=>{const n=s.filter(m=>$(m)===o),c=n.filter(m=>t.includes(m)),a=n.length>0&&c.length===n.length,d=c.length>0;return`
                <label class="filter-checkbox-label">
                    <input type="checkbox" value="${o}" ${a||d?"checked":""} 
                           ${d&&!a?'data-indeterminate="true"':""}
                           data-filter="department" data-category="true">
                    <span class="filter-checkbox-text">${o}</span>
                </label>
            `}).join("")}updateDepartmentFilter(e){if(!this.isUpdatingFilter){this.isUpdatingFilter=!0;try{const t=e.querySelectorAll('input[data-filter="department"]:checked');let s=[];if(this.isCategoryMode){const r=Array.from(t).map(o=>o.value),i=this.filterService?.getFilterOptions("department",this.allCourses)||[];r.forEach(o=>{const n=i.filter(c=>$(c)===o);s.push(...n)})}else s=Array.from(t).map(r=>r.value);s.length>0?this.filterService?.addFilter("department",{departments:s}):this.filterService?.removeFilter("department"),this.updatePreview(e)}finally{setTimeout(()=>{this.isUpdatingFilter=!1},100)}}}updateAvailabilityFilter(e){e.querySelector('input[data-filter="availability"]').checked?this.filterService?.addFilter("availability",{availableOnly:!0}):this.filterService?.removeFilter("availability"),this.updatePreview(e)}updateCreditRangeFilter(e){const t=e.querySelector("#credit-min"),s=e.querySelector("#credit-max"),r=parseInt(t.value),i=parseInt(s.value);r&&i&&(r!==1||i!==4)?this.filterService?.addFilter("creditRange",{min:r,max:i}):this.filterService?.removeFilter("creditRange"),this.updatePreview(e)}addProfessorFilter(e,t){if(!this.filterService)return;const r=this.filterService.getActiveFilters().find(i=>i.id==="professor")?.criteria?.professors||[];if(!r.includes(e)){const i=[...r,e];this.filterService.addFilter("professor",{professors:i}),this.refreshProfessorChips(t),this.updatePreview(t)}}removeProfessorFilter(e,t){if(!this.filterService)return;const i=(this.filterService.getActiveFilters().find(o=>o.id==="professor")?.criteria?.professors||[]).filter(o=>o!==e);i.length>0?this.filterService.addFilter("professor",{professors:i}):this.filterService.removeFilter("professor"),this.refreshProfessorChips(t),this.updatePreview(t)}refreshProfessorChips(e){if(!this.filterService)return;const s=this.filterService.getActiveFilters().find(i=>i.id==="professor")?.criteria?.professors||[],r=e.querySelector(".filter-selected-chips");r&&(r.innerHTML=s.map(i=>`
                <span class="filter-chip">
                    ${this.escapeHtml(i)}
                    <button class="filter-chip-remove" data-professor="${this.escapeHtml(i)}">×</button>
                </span>
            `).join(""))}updateTermFilter(e){const t=e.querySelectorAll('input[data-filter="term"]:checked'),s=Array.from(t).map(r=>r.value);s.length>0?this.filterService?.addFilter("term",{terms:s}):this.filterService?.removeFilter("term"),this.updatePreview(e)}updateLocationFilter(e){const t=e.querySelectorAll('input[data-filter="location"]:checked'),s=Array.from(t).map(r=>r.value);s.length>0?this.filterService?.addFilter("location",{buildings:s}):this.filterService?.removeFilter("location"),this.updatePreview(e)}updatePreview(e){if(!this.filterService)return;const s=this.filterService.filterCourses(this.allCourses).length,r=this.filterService.getFilterCount(),i=e.querySelector("#course-count-preview"),o=e.querySelector("#filter-count");i&&(i.textContent=`${s} courses match current filters`),o&&(o.textContent=r>0?`(${r})`:"")}escapeHtml(e){const t=document.createElement("div");return t.textContent=e,t.innerHTML}unescapeHtml(e){const t=document.createElement("div");return t.innerHTML=e,t.textContent||t.innerText||""}}class qe{constructor(e){this.scheduleFilterService=null,this.selectedCourses=[],this.currentModalId=null,this.modalService=e}setScheduleFilterService(e){this.scheduleFilterService=e}setSelectedCourses(e){this.selectedCourses=e}show(){if(!this.scheduleFilterService)return console.error("ScheduleFilterService not set on ScheduleFilterModalController"),"";const e=this.modalService.generateId();this.currentModalId=e;const t=this.createModalElement(e);return this.modalService.showModal(e,t),this.modalService.setupModalBehavior(t,e,{closeOnBackdrop:!0,closeOnEscape:!0}),setTimeout(()=>{this.setupFilterModalEventListeners(),this.initializeFormState()},50),e}hide(){this.currentModalId&&(this.modalService.hideModal(this.currentModalId),this.currentModalId=null)}createModalElement(e){const t=document.createElement("div");t.className="modal-backdrop schedule-filter-modal",t.id=e,t.innerHTML=`
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">Filter Selected Courses</h3>
                        <button class="modal-close" type="button">×</button>
                    </div>
                    <div class="modal-body">
                        ${this.createFilterModalContent()}
                    </div>
                </div>
            </div>
        `;const s=t.querySelector(".modal-close");return s&&s.addEventListener("click",()=>this.hide()),t}createFilterModalContent(){const e=this.scheduleFilterService.getActiveFilters();return`
            <div class="filter-modal-content">
                <div class="active-filters-section">
                    <h3>Active Filters</h3>
                    <div id="active-filters-list" class="active-filters-list">
                        ${this.renderActiveFilters(e)}
                    </div>
                </div>

                <div class="available-filters-section">
                    <h3>Period Search Filters</h3>
                    
                    <div class="filter-group">
                        <h4>Search Periods</h4>
                        <div class="filter-option">
                            <input type="text" id="modal-search-input" placeholder="Search professors, buildings, courses..." 
                                   value="${this.getSearchValue()}" class="search-input">
                        </div>
                    </div>

                    <div class="filter-group">
                        <h4>Select Courses to Search</h4>
                        <div class="filter-option">
                            ${this.renderCourseSelectionCheckboxes()}
                        </div>
                    </div>


                    <div class="filter-group">
                        <h4>Exclude Days</h4>
                        <div class="filter-option">
                            <div class="filter-help-text">Hide sections with classes on selected days</div>
                            ${this.renderDaysCheckboxes()}
                        </div>
                    </div>

                    <div class="filter-group">
                        <h4>Professor</h4>
                        <div class="filter-option">
                            ${this.renderProfessorCheckboxes()}
                        </div>
                    </div>

                    <div class="filter-group">
                        <h4>Exclude Period Types</h4>
                        <div class="filter-option">
                            <div class="filter-help-text">Hide sections with selected period types</div>
                            ${this.renderPeriodTypeCheckboxes()}
                        </div>
                    </div>

                    <div class="filter-group">
                        <h4>Academic Terms</h4>
                        <div class="filter-option">
                            <div class="filter-help-text">Show sections from selected academic terms</div>
                            ${this.renderTermCheckboxes()}
                        </div>
                    </div>

                    <div class="filter-group">
                        <h4>Availability</h4>
                        <div class="filter-option">
                            <label class="checkbox-label">
                                <input type="checkbox" id="available-only-filter">
                                <span class="checkbox-text">Available Seats Only</span>
                            </label>
                            <div class="min-seats-input" style="margin-top: 0.5rem;">
                                <label>Minimum Available Seats:</label>
                                <input type="number" id="min-seats-filter" min="0" max="999" placeholder="Any">
                            </div>
                        </div>
                    </div>
                    <div class="filter-group">
                        <h4>Schedule Conflicts</h4>
                        <div class="filter-option">
                            <label class="checkbox-label">
                                <input type="checkbox" id="avoid-conflicts-filter">
                                <span class="checkbox-text">Hide periods that conflict with selected sections</span>
                            </label>
                        </div>
                    </div>
                </div>

                <div class="filter-modal-actions">
                    <button id="clear-all-filters" class="btn btn-secondary">Clear All</button>
                    <button id="apply-filters" class="btn btn-primary">Apply Filters</button>
                </div>
            </div>
        `}renderActiveFilters(e){return e.length===0?'<div class="no-filters">No active filters</div>':e.map(t=>`
            <div class="active-filter-tag" data-filter-id="${t.id}">
                <span class="filter-name">${t.name}:</span>
                <span class="filter-value">${t.displayValue}</span>
                <button class="remove-filter-btn" data-filter-id="${t.id}">×</button>
            </div>
        `).join("")}renderCourseSelectionCheckboxes(){const e=this.scheduleFilterService.getFilterOptions("courseSelection",this.selectedCourses)||[],t=this.getActiveCourseSelection();return e.length===0?'<div class="no-options">No courses available</div>':e.map(s=>`
            <label class="checkbox-label">
                <input type="checkbox" name="courseSelection" value="${s.value}" 
                       ${t.includes(s.value)?"checked":""}>
                <span class="checkbox-text">${s.label}</span>
            </label>
        `).join("")}renderDaysCheckboxes(){const e=this.scheduleFilterService.getFilterOptions("periodDays",this.selectedCourses)||[],t=this.getActiveDays();return e.map(s=>`
            <label class="checkbox-label">
                <input type="checkbox" name="periodDays" value="${s.value}" 
                       ${t.includes(s.value)?"checked":""}>
                <span class="checkbox-text">${s.label}</span>
            </label>
        `).join("")}renderProfessorCheckboxes(){const e=this.scheduleFilterService.getFilterOptions("periodProfessor",this.selectedCourses)||[],t=this.getActiveProfessors();return e.length===0?'<div class="no-options">No professors available</div>':`
            <div class="filter-search-container">
                <input type="text" class="filter-search professor-search" 
                       placeholder="Search professors..." data-filter="professor">
                <div class="professor-dropdown" id="professor-dropdown" style="display: none;"></div>
            </div>
            <div class="filter-selected-chips">
                ${t.map(r=>`
            <div class="filter-chip" data-professor="${r}">
                <span>${r}</span>
                <button type="button" class="chip-remove" data-professor="${r}">×</button>
            </div>
        `).join("")}
            </div>
        `}renderPeriodTypeCheckboxes(){const e=this.scheduleFilterService.getFilterOptions("periodType",this.selectedCourses)||[],t=this.getActivePeriodTypes();return e.length===0?'<div class="no-options">No period types available</div>':e.map(s=>`
            <label class="checkbox-label">
                <input type="checkbox" name="periodType" value="${s.value}" 
                       ${t.includes(s.value)?"checked":""}>
                <span class="checkbox-text">${s.label}</span>
            </label>
        `).join("")}renderTermCheckboxes(){const e=this.scheduleFilterService.getFilterOptions("periodTerm",this.selectedCourses)||[],t=this.getActiveTerms();return e.length===0?'<div class="no-options">No academic terms available</div>':e.map(s=>`
            <label class="checkbox-label">
                <input type="checkbox" name="periodTerm" value="${s.value}" 
                       ${t.includes(s.value)?"checked":""}>
                <span class="checkbox-text">${s.label}</span>
            </label>
        `).join("")}getSearchValue(){return this.scheduleFilterService.getActiveFilters().find(t=>t.id==="searchText")?.criteria?.query||""}getActiveCourseSelection(){return this.scheduleFilterService.getActiveFilters().find(t=>t.id==="courseSelection")?.criteria?.selectedCourseIds||[]}getActiveDays(){return this.scheduleFilterService.getActiveFilters().find(t=>t.id==="periodDays")?.criteria?.days||[]}getActiveProfessors(){return this.scheduleFilterService.getActiveFilters().find(t=>t.id==="periodProfessor")?.criteria?.professors||[]}getActivePeriodTypes(){return this.scheduleFilterService.getActiveFilters().find(t=>t.id==="periodType")?.criteria?.types||[]}getActiveTerms(){return this.scheduleFilterService.getActiveFilters().find(t=>t.id==="periodTerm")?.criteria?.terms||[]}getActiveTimeRange(){return this.scheduleFilterService.getActiveFilters().find(t=>t.id==="periodTime")?.criteria||{}}getActiveAvailability(){return this.scheduleFilterService.getActiveFilters().find(t=>t.id==="periodAvailability")?.criteria||{availableOnly:!1}}getActiveConflictDetection(){return this.scheduleFilterService.getActiveFilters().find(t=>t.id==="periodConflict")?.criteria||{avoidConflicts:!1}}setupFilterModalEventListeners(){if(!this.currentModalId)return;const e=document.getElementById(this.currentModalId);if(!e)return;e.querySelectorAll(".remove-filter-btn").forEach(o=>{o.addEventListener("click",n=>{const c=n.target.dataset.filterId;c&&(this.scheduleFilterService.removeFilter(c),this.refreshActiveFilters())})}),e.querySelector("#clear-all-filters")?.addEventListener("click",()=>{this.scheduleFilterService.clearFilters(),this.refreshActiveFilters(),this.resetFilterInputs()}),e.querySelector("#apply-filters")?.addEventListener("click",()=>{this.applyFilters(),this.hide()});const t=e.querySelector("#modal-search-input");t&&t.addEventListener("input",()=>{const o=t.value.trim();o?this.scheduleFilterService.addFilter("searchText",{query:o}):this.scheduleFilterService.removeFilter("searchText"),this.refreshActiveFilters()}),e.querySelectorAll('input[name="courseSelection"]').forEach(o=>{o.addEventListener("change",()=>{this.updateCourseSelectionFilter(),this.refreshActiveFilters()})}),e.querySelectorAll('input[name="periodDays"]').forEach(o=>{o.addEventListener("change",()=>{this.updateDaysFilter(),this.refreshActiveFilters()})}),e.querySelectorAll('input[name="periodType"]').forEach(o=>{o.addEventListener("change",()=>{this.updatePeriodTypeFilter(),this.refreshActiveFilters()})}),e.querySelectorAll('input[name="periodTerm"]').forEach(o=>{o.addEventListener("change",()=>{this.updateTermFilter(),this.refreshActiveFilters()})});const s=e.querySelector("#available-only-filter"),r=e.querySelector("#min-seats-filter");s&&s.addEventListener("change",()=>{this.updateAvailabilityFilter(),this.refreshActiveFilters()}),r&&r.addEventListener("input",()=>{this.updateAvailabilityFilter(),this.refreshActiveFilters()});const i=e.querySelector("#avoid-conflicts-filter");i&&i.addEventListener("change",()=>{this.updateConflictFilter(),this.refreshActiveFilters()}),this.setupProfessorFilter(e)}updateCourseSelectionFilter(){if(!this.currentModalId)return;const e=document.getElementById(this.currentModalId);if(e){const t=Array.from(e.querySelectorAll('input[name="courseSelection"]:checked')).map(s=>s.value);t.length>0?this.scheduleFilterService.addFilter("courseSelection",{selectedCourseIds:t}):this.scheduleFilterService.removeFilter("courseSelection")}}updateDaysFilter(){if(!this.currentModalId)return;const e=document.getElementById(this.currentModalId);if(e){const t=Array.from(e.querySelectorAll('input[name="periodDays"]:checked')).map(s=>s.value);t.length>0?this.scheduleFilterService.addFilter("periodDays",{days:t}):this.scheduleFilterService.removeFilter("periodDays")}}updatePeriodTypeFilter(){if(!this.currentModalId)return;const e=document.getElementById(this.currentModalId);if(e){const t=Array.from(e.querySelectorAll('input[name="periodType"]:checked')).map(s=>s.value);t.length>0?this.scheduleFilterService.addFilter("periodType",{types:t}):this.scheduleFilterService.removeFilter("periodType")}}updateTermFilter(){if(!this.currentModalId)return;const e=document.getElementById(this.currentModalId);if(e){const t=Array.from(e.querySelectorAll('input[name="periodTerm"]:checked')).map(s=>s.value);t.length>0?this.scheduleFilterService.addFilter("periodTerm",{terms:t}):this.scheduleFilterService.removeFilter("periodTerm")}}updateAvailabilityFilter(){if(!this.currentModalId)return;const e=document.getElementById(this.currentModalId);if(e){const t=e.querySelector("#available-only-filter")?.checked||!1,s=e.querySelector("#min-seats-filter")?.value,r=s?parseInt(s):void 0;if(t||r&&r>0){const i={availableOnly:t};r&&r>0&&(i.minAvailable=r),this.scheduleFilterService.addFilter("periodAvailability",i)}else this.scheduleFilterService.removeFilter("periodAvailability")}}updateConflictFilter(){if(!this.currentModalId)return;const e=document.getElementById(this.currentModalId);e&&(e.querySelector("#avoid-conflicts-filter")?.checked||!1?this.scheduleFilterService.addFilter("periodConflict",{avoidConflicts:!0}):this.scheduleFilterService.removeFilter("periodConflict"))}initializeFormState(){if(!this.currentModalId)return;const e=document.getElementById(this.currentModalId);if(!e)return;const t=this.getActiveAvailability(),s=e.querySelector("#available-only-filter"),r=e.querySelector("#min-seats-filter");s&&(s.checked=t.availableOnly),r&&t.minAvailable&&(r.value=t.minAvailable.toString());const i=this.getActiveConflictDetection(),o=e.querySelector("#avoid-conflicts-filter");o&&(o.checked=i.avoidConflicts)}applyFilters(){this.scheduleFilterService.saveFiltersToStorage()}refreshActiveFilters(){if(!this.currentModalId)return;const e=document.getElementById(this.currentModalId);if(e){const t=e.querySelector("#active-filters-list");if(t){const s=this.scheduleFilterService.getActiveFilters();t.innerHTML=this.renderActiveFilters(s),t.querySelectorAll(".remove-filter-btn").forEach(r=>{r.addEventListener("click",i=>{const o=i.target.dataset.filterId;o&&(this.scheduleFilterService.removeFilter(o),this.refreshActiveFilters())})})}}}resetFilterInputs(){if(!this.currentModalId)return;const e=document.getElementById(this.currentModalId);if(e){const t=e.querySelector("#modal-search-input");t&&(t.value="");const s=e.querySelector("#section-status-filter");s&&(s.value="");const r=e.querySelector("#required-status-filter");r&&(r.value=""),e.querySelectorAll('input[type="checkbox"]').forEach(i=>{i.checked=!1})}}setupProfessorFilter(e){const t=e.querySelector(".professor-search"),s=e.querySelector("#professor-dropdown");if(t&&this.scheduleFilterService){const i=(this.scheduleFilterService.getFilterOptions("periodProfessor",this.selectedCourses)||[]).map(o=>o.value).filter(o=>o&&o.trim()!=="TBA");t.addEventListener("input",()=>{const o=t.value.toLowerCase();if(o.length>0){const n=i.filter(c=>c.toLowerCase().includes(o)).slice(0,10);s.innerHTML=n.map(c=>`<div class="professor-option" data-professor="${c}">${c}</div>`).join(""),s.style.display=n.length>0?"block":"none"}else s.style.display="none"}),s.addEventListener("click",o=>{const n=o.target;if(n.classList.contains("professor-option")){const c=n.dataset.professor;c&&(this.addProfessorToSelection(c),t.value="",s.style.display="none")}}),document.addEventListener("click",o=>{!t.contains(o.target)&&!s.contains(o.target)&&(s.style.display="none")})}e.querySelectorAll(".chip-remove").forEach(r=>{r.addEventListener("click",i=>{const o=i.target.dataset.professor;o&&this.removeProfessorFromSelection(o)})})}addProfessorToSelection(e){const t=this.getActiveProfessors();t.includes(e)||(t.push(e),this.scheduleFilterService.addFilter("periodProfessor",{professors:t}),this.refreshActiveFilters(),this.refreshProfessorChips())}removeProfessorFromSelection(e){const s=this.getActiveProfessors().filter(r=>r!==e);s.length>0?this.scheduleFilterService.addFilter("periodProfessor",{professors:s}):this.scheduleFilterService.removeFilter("periodProfessor"),this.refreshActiveFilters(),this.refreshProfessorChips()}refreshProfessorChips(){if(!this.currentModalId)return;const e=document.getElementById(this.currentModalId);if(e){const t=e.querySelector(".filter-selected-chips");if(t){const r=this.getActiveProfessors().map(i=>`
                    <div class="filter-chip" data-professor="${i}">
                        <span>${i}</span>
                        <button type="button" class="chip-remove" data-professor="${i}">×</button>
                    </div>
                `).join("");t.innerHTML=r,t.querySelectorAll(".chip-remove").forEach(i=>{i.addEventListener("click",o=>{const n=o.target.dataset.professor;n&&this.removeProfessorFromSelection(n)})})}}}syncSearchInputFromMain(e){if(this.currentModalId){const t=document.getElementById(this.currentModalId);if(t){const s=t.querySelector("#modal-search-input");s&&s.value!==e&&(s.value=e)}}}}class Ue{constructor(){this.activeFilters=new Map,this.listeners=[]}addFilter(e,t,s,r){const i={id:e,name:t,criteria:s,displayValue:r};this.activeFilters.set(e,i),this.notifyListeners({type:"add",filterId:e,criteria:s,activeFilters:this.getActiveFilters()})}removeFilter(e){const t=this.activeFilters.delete(e);return t&&this.notifyListeners({type:"remove",filterId:e,activeFilters:this.getActiveFilters()}),t}updateFilter(e,t,s){const r=this.activeFilters.get(e);return r?(r.criteria=t,r.displayValue=s,this.notifyListeners({type:"update",filterId:e,criteria:t,activeFilters:this.getActiveFilters()}),!0):!1}clearFilters(){this.activeFilters.clear(),this.notifyListeners({type:"clear",activeFilters:[]})}hasFilter(e){return this.activeFilters.has(e)}getFilter(e){return this.activeFilters.get(e)}getActiveFilters(){return Array.from(this.activeFilters.values())}getFilterCriteria(){const e={};for(const[t,s]of this.activeFilters)e[t]=s.criteria;return e}getActiveFilterIds(){return Array.from(this.activeFilters.keys())}getFilterCount(){return this.activeFilters.size}isEmpty(){return this.activeFilters.size===0}addEventListener(e){this.listeners.push(e)}removeEventListener(e){const t=this.listeners.indexOf(e);t>-1&&this.listeners.splice(t,1)}notifyListeners(e){this.listeners.forEach(t=>{try{t(e)}catch(s){console.error("Error in filter event listener:",s)}})}serialize(){const e={filters:Array.from(this.activeFilters.entries()).map(([t,s])=>({id:s.id,name:s.name,criteria:s.criteria,displayValue:s.displayValue}))};return JSON.stringify(e)}deserialize(e){try{const t=JSON.parse(e);return this.activeFilters.clear(),t.filters&&Array.isArray(t.filters)&&t.filters.forEach(s=>{this.activeFilters.set(s.id,s)}),this.notifyListeners({type:"clear",activeFilters:this.getActiveFilters()}),!0}catch(t){return console.error("Failed to deserialize filter state:",t),!1}}}class U{constructor(e){this.registeredFilters=new Map,this.filterState=new Ue,this.searchService=e}registerFilter(e){this.registeredFilters.set(e.id,e)}unregisterFilter(e){const t=this.registeredFilters.delete(e);return t&&this.removeFilter(e),t}getRegisteredFilter(e){return this.registeredFilters.get(e)}getAvailableFilters(){return Array.from(this.registeredFilters.values())}addFilter(e,t){const s=this.registeredFilters.get(e);if(!s)return console.error(`Filter '${e}' is not registered`),!1;if(!s.isValidCriteria(t))return console.error(`Invalid criteria for filter '${e}'`),!1;const r=s.getDisplayValue(t);return this.filterState.addFilter(e,s.name,t,r),!0}updateFilter(e,t){const s=this.registeredFilters.get(e);if(!s||!s.isValidCriteria(t))return!1;const r=s.getDisplayValue(t);return this.filterState.updateFilter(e,t,r)}removeFilter(e){return this.filterState.removeFilter(e)}clearFilters(){this.filterState.clearFilters()}toggleFilter(e,t){return this.hasFilter(e)?this.removeFilter(e):this.addFilter(e,t)}hasFilter(e){return this.filterState.hasFilter(e)}getActiveFilters(){return this.filterState.getActiveFilters()}getFilterCount(){return this.filterState.getFilterCount()}isEmpty(){return this.filterState.isEmpty()}filterCourses(e){if(this.isEmpty())return e;let t=e;const s=this.getActiveFilters(),r=s.find(i=>i.id==="searchText");if(r){const i=this.registeredFilters.get(r.id);i&&(t=i.apply(t,r.criteria))}for(const i of s)if(i.id!=="searchText"){const o=this.registeredFilters.get(i.id);o&&(t=o.apply(t,i.criteria))}return t}searchAndFilter(e,t){return e.trim()?this.addFilter("searchText",{query:e.trim()}):this.removeFilter("searchText"),this.filterCourses(t)}addEventListener(e){this.filterState.addEventListener(e)}removeEventListener(e){this.filterState.removeEventListener(e)}saveFiltersToStorage(){const e=this.filterState.serialize();localStorage.setItem("wpi-course-filters",e)}loadFiltersFromStorage(){const e=localStorage.getItem("wpi-course-filters");return e?this.filterState.deserialize(e):!1}getFilterSummary(){const e=this.getActiveFilters();return e.length===0?"No filters active":e.length===1?`1 filter: ${e[0].displayValue}`:`${e.length} filters active`}convertToSearchFilter(){const e=this.filterState.getFilterCriteria();return{departments:e.department?.departments||[],timeSlots:e.timeSlot?.timeSlots||[],professors:e.professor?.professors||[],availabilityOnly:e.availability?.availableOnly||!1,creditRange:e.creditRange?{min:e.creditRange.min,max:e.creditRange.max}:void 0}}getFilterOptions(e,t){switch(e){case"department":return this.getDepartmentOptions(t);case"professor":return this.getProfessorOptions(t);case"term":return this.getTermOptions(t);case"location":return this.getLocationOptions(t);default:return null}}getDepartmentOptions(e){const t=new Set;return e.forEach(s=>t.add(s.department.abbreviation)),Array.from(t).sort()}getProfessorOptions(e){return this.searchService.getAvailableProfessors()}getTermOptions(e){const t=new Set;return e.forEach(s=>{s.sections.forEach(r=>{r.computedTerm&&t.add(r.computedTerm)})}),Array.from(t).sort()}getLocationOptions(e){return{buildings:this.searchService.getAvailableBuildings()}}}class ze{constructor(){this.id="courseSelection",this.name="Course Selection",this.description="Select which courses to search periods within"}apply(e,t){return e}applyToSelectedCourses(e,t){if(!t.selectedCourseIds||t.selectedCourseIds.length===0)return e;const s=new Set(t.selectedCourseIds);return e.filter(r=>s.has(r.course.id))}isValidCriteria(e){return e&&typeof e=="object"&&"selectedCourseIds"in e&&Array.isArray(e.selectedCourseIds)&&e.selectedCourseIds.every(t=>typeof t=="string")}getDisplayValue(e){const t=e.selectedCourseIds.length;return t===0?"All Courses":t===1?"1 Course Selected":`${t} Courses Selected`}}class Ve{constructor(){this.id="periodDays",this.name="Period Days",this.description="Exclude sections with classes on selected days"}apply(e,t){return e}applyToPeriods(e,t){if(!t.days||t.days.length===0)return e;const s=new Set(t.days.map(r=>r.toLowerCase()));return e.filter(r=>!Array.from(r.days).some(i=>s.has(i.toLowerCase())))}isValidCriteria(e){return!!(e&&typeof e=="object"&&"days"in e&&Array.isArray(e.days)&&e.days.every(t=>typeof t=="string"))}getDisplayValue(e){return!e.days||e.days.length===0?"No exclusions":e.days.length===1?`Exclude: ${this.formatDayName(e.days[0])}`:`Exclude: ${e.days.map(s=>this.formatDayName(s)).join(", ")}`}formatDayName(e){return{mon:"Monday",tue:"Tuesday",wed:"Wednesday",thu:"Thursday",fri:"Friday",sat:"Saturday",sun:"Sunday"}[e.toLowerCase()]||e}}class je{constructor(){this.id="periodProfessor",this.name="Period Professor",this.description="Filter periods by professor"}apply(e,t){return e}applyToPeriods(e,t){if(!t.professors||t.professors.length===0)return e;const s=new Set(t.professors.map(r=>r.toLowerCase().trim()));return e.filter(r=>{if(!r.professor)return!1;const i=r.professor.toLowerCase().trim();return s.has(i)||Array.from(s).some(o=>i.includes(o)||o.includes(i))})}isValidCriteria(e){return e&&typeof e=="object"&&"professors"in e&&Array.isArray(e.professors)&&e.professors.every(t=>typeof t=="string")}getDisplayValue(e){return!e.professors||e.professors.length===0?"Any Professor":e.professors.length===1?e.professors[0]:`${e.professors.length} Professors`}}class Ye{constructor(){this.id="periodType",this.name="Period Type",this.description="Exclude sections with selected period types"}apply(e,t){return e}applyToPeriods(e,t){if(!t.types||t.types.length===0)return e;const s=new Set(t.types.map(r=>this.normalizeType(r)));return e.filter(r=>{const i=this.normalizeType(r.type);return!s.has(i)})}normalizeType(e){const t=e.toLowerCase().trim();return t.includes("lec")||t.includes("lecture")?"lecture":t.includes("lab")?"lab":t.includes("dis")||t.includes("discussion")?"discussion":t.includes("rec")||t.includes("recitation")?"recitation":t.includes("sem")||t.includes("seminar")?"seminar":t.includes("studio")?"studio":t.includes("conference")||t.includes("conf")?"conference":t}isValidCriteria(e){return!!(e&&typeof e=="object"&&"types"in e&&Array.isArray(e.types)&&e.types.every(t=>typeof t=="string"))}getDisplayValue(e){return!e.types||e.types.length===0?"No exclusions":e.types.length===1?`Exclude: ${this.formatTypeName(e.types[0])}`:`Exclude: ${e.types.map(s=>this.formatTypeName(s)).join(", ")}`}formatTypeName(e){const t=this.normalizeType(e);return{lecture:"Lecture",lab:"Lab",discussion:"Discussion",recitation:"Recitation",seminar:"Seminar",studio:"Studio",conference:"Conference"}[t]||e.charAt(0).toUpperCase()+e.slice(1).toLowerCase()}}class We{constructor(){this.id="periodTerm",this.name="Term",this.description="Show sections from selected academic terms"}apply(e,t){return e}applyToSections(e,t){if(!t.terms||t.terms.length===0)return e;const s=new Set(t.terms.map(r=>this.normalizeTerm(r)));return e.filter(r=>{const i=this.normalizeTerm(r.section.computedTerm);return s.has(i)})}normalizeTerm(e){return e?e.toUpperCase().trim():""}isValidCriteria(e){return!!(e&&typeof e=="object"&&"terms"in e&&Array.isArray(e.terms)&&e.terms.every(t=>typeof t=="string"))}getDisplayValue(e){return!e.terms||e.terms.length===0?"All terms":e.terms.length===1?`Term: ${this.formatTermName(e.terms[0])}`:`Terms: ${e.terms.map(s=>this.formatTermName(s)).join(", ")}`}formatTermName(e){const t=this.normalizeTerm(e);return{A:"A Term",B:"B Term",C:"C Term",D:"D Term"}[t]||e.toUpperCase()}}class _e{constructor(){this.id="periodAvailability",this.name="Period Availability",this.description="Filter periods by seat availability"}apply(e,t){return e}applyToPeriods(e,t){return e.filter(s=>!(t.availableOnly&&s.seatsAvailable<=0||t.minAvailable&&typeof t.minAvailable=="number"&&s.seatsAvailable<t.minAvailable))}isValidCriteria(e){return!(!e||typeof e!="object"||"availableOnly"in e&&typeof e.availableOnly!="boolean"||e.minAvailable&&(typeof e.minAvailable!="number"||e.minAvailable<0))}getDisplayValue(e){const t=[];return e.availableOnly&&t.push("Available Only"),e.minAvailable&&e.minAvailable>0&&t.push(`Min ${e.minAvailable} Seats`),t.length>0?t.join(", "):"Any Availability"}}class Ge{constructor(e){this.id="periodConflict",this.name="Schedule Conflicts",this.description="Hide periods that conflict with selected sections",this.conflictDetector=e}applyToPeriods(e,t){if(!t.avoidConflicts||!t.selectedCourses)return e;const s=[];for(const r of t.selectedCourses)if(r.selectedSectionNumber){const i=r.course.sections.find(o=>o.number===r.selectedSectionNumber);i&&s.push(i)}return s.length===0?e:e.filter(r=>{const i={crn:Math.floor(Math.random()*99999),number:"TEMP",periods:[r],seats:999,seatsAvailable:999,actualWaitlist:0,maxWaitlist:0,description:"Temporary section for conflict detection",term:"TEMP"},o=[...s,i];return this.conflictDetector.detectConflicts(o).length===0})}applyToPeriodsWithContext(e,t){if(!t.avoidConflicts||!t.selectedCourses)return e;const s=new Map;for(const r of t.selectedCourses)if(r.selectedSectionNumber){const i=r.course.sections.find(o=>o.number===r.selectedSectionNumber);i&&s.set(r.course.id,i)}return s.size===0?e:e.filter(r=>{const i=r.course.course,o=r.period,n=[];for(const[l,u]of s.entries())l!==i.id&&n.push(u);if(n.length===0)return!0;const c={crn:Math.floor(Math.random()*99999),number:"TEMP",periods:[o],seats:999,seatsAvailable:999,actualWaitlist:0,maxWaitlist:0,description:"Temporary section for conflict detection",term:"TEMP"},a=[...n,c];return this.conflictDetector.detectConflicts(a).length===0})}applyToSectionsWithContext(e,t){if(!t.avoidConflicts||!t.selectedCourses)return e;const s=new Map;for(const r of t.selectedCourses)if(r.selectedSectionNumber){const i=r.course.sections.find(o=>o.number===r.selectedSectionNumber);i&&s.set(r.course.id,i)}return s.size===0?e:e.filter(r=>{const i=r.course.course,o=r.section,n=[];for(const[c,a]of s.entries())c!==i.id&&n.push(a);if(n.length===0)return!0;for(const c of o.periods){const a={crn:Math.floor(Math.random()*99999),number:"TEMP",periods:[c],seats:999,seatsAvailable:999,actualWaitlist:0,maxWaitlist:0,description:"Temporary section for conflict detection",term:"TEMP"},d=[...n,a];if(this.conflictDetector.detectConflicts(d).length>0)return!1}return!0})}applyCriteriaToSelectedCourses(e,t){return e}apply(e,t){return e}isValidCriteria(e){return!e||typeof e!="object"?!1:typeof e.avoidConflicts=="boolean"}getDisplayValue(e){return e.avoidConflicts?"Avoiding conflicts":"Conflicts allowed"}}class Ke{constructor(){this.id="sectionCode",this.name="Section Code",this.description="Filter by section codes (AL01, AX01, A01, etc.)"}apply(e,t){return e}isValidCriteria(e){return!e||typeof e!="object"?!1:Array.isArray(e.codes)&&e.codes.every(t=>typeof t=="string")}getDisplayValue(e){return!e.codes||e.codes.length===0?"No section codes":e.codes.length===1?`Section: ${e.codes[0]}`:`Sections: ${e.codes.join(", ")}`}}class Je{constructor(){this.id="department",this.name="Department",this.description="Filter courses by department(s)"}apply(e,t){if(!t.departments||t.departments.length===0)return e;const s=new Set(t.departments.map(r=>r.toLowerCase()));return e.filter(r=>s.has(r.department.abbreviation.toLowerCase()))}isValidCriteria(e){return e&&Array.isArray(e.departments)&&e.departments.every(t=>typeof t=="string")}getDisplayValue(e){return e.departments.length===1?`Department: ${e.departments[0]}`:`Departments: ${e.departments.join(", ")}`}}class Qe{constructor(){this.id="availability",this.name="Availability",this.description="Show only courses with available seats"}apply(e,t){return t.availableOnly?e.filter(s=>s.sections.some(r=>r.seatsAvailable>0)):e}isValidCriteria(e){return e&&typeof e.availableOnly=="boolean"}getDisplayValue(e){return e.availableOnly?"Available seats only":"All courses"}}class Ze{constructor(){this.id="creditRange",this.name="Credit Range",this.description="Filter courses by credit hours"}apply(e,t){return e.filter(s=>s.maxCredits>=t.min&&s.minCredits<=t.max)}isValidCriteria(e){return e&&typeof e.min=="number"&&typeof e.max=="number"&&e.min>=0&&e.max>=e.min}getDisplayValue(e){return e.min===e.max?`${e.min} credit${e.min===1?"":"s"}`:`${e.min}-${e.max} credits`}}class Xe{constructor(){this.id="professor",this.name="Professor",this.description="Filter courses by instructor"}apply(e,t){if(!t.professors||t.professors.length===0)return e;const s=new Set(t.professors.map(r=>r.toLowerCase()));return e.filter(r=>r.sections.some(i=>i.periods.some(o=>s.has(o.professor.toLowerCase()))))}isValidCriteria(e){return e&&Array.isArray(e.professors)&&e.professors.every(t=>typeof t=="string")}getDisplayValue(e){return e.professors.length===1?`Professor: ${e.professors[0]}`:e.professors.length<=3?`Professors: ${e.professors.join(", ")}`:`Professors: ${e.professors.slice(0,2).join(", ")}, +${e.professors.length-2} more`}}class et{constructor(){this.id="term",this.name="Term",this.description="Filter courses by academic term"}apply(e,t){if(!t.terms||t.terms.length===0)return e;const s=new Set(t.terms.map(r=>r.toUpperCase()));return e.filter(r=>r.sections.some(i=>s.has(i.computedTerm)))}isValidCriteria(e){return e&&Array.isArray(e.terms)&&e.terms.every(t=>typeof t=="string")}getDisplayValue(e){return e.terms.length===1?`Term: ${e.terms[0]}`:`Terms: ${e.terms.join(", ")}`}}class z{constructor(){this.id="searchText",this.name="Search Text",this.description="Filter courses by search text"}apply(e,t){if(!t.query||!t.query.trim())return e;const s=t.query.trim().toLowerCase();return e.filter(r=>{const i=[r.id,r.name,r.description,r.department.abbreviation,r.department.name,r.number].join(" ").toLowerCase();return i.includes(s)||this.fuzzyMatch(i,s)})}fuzzyMatch(e,t){return t.length<=3?e.includes(t):t.split(/\s+/).every(r=>{if(r.length<=2)return e.includes(r);const i=r.substring(0,Math.floor(r.length*.8));return e.includes(i)})}isValidCriteria(e){return e&&typeof e=="object"&&"query"in e&&typeof e.query=="string"}getDisplayValue(e){return`"${e.query.trim()}"`}}const tt=()=>[new Je,new Qe,new Ze,new Xe,new et];class st{constructor(e){this.periodConflictFilter=null,this.filterService=new U(e),this.courseSelectionFilter=new ze,this.periodDaysFilter=new Ve,this.periodProfessorFilter=new je,this.periodTypeFilter=new Ye,this.periodTermFilter=new We,this.periodAvailabilityFilter=new _e,this.sectionCodeFilter=new Ke,this.initializeFilters()}setConflictDetector(e){this.periodConflictFilter=new Ge(e),this.filterService.registerFilter(this.periodConflictFilter)}initializeFilters(){const e=new z;this.filterService.registerFilter(e),this.filterService.registerFilter(this.courseSelectionFilter),this.filterService.registerFilter(this.periodDaysFilter),this.filterService.registerFilter(this.periodProfessorFilter),this.filterService.registerFilter(this.periodTypeFilter),this.filterService.registerFilter(this.periodTermFilter),this.filterService.registerFilter(this.periodAvailabilityFilter),this.filterService.registerFilter(this.sectionCodeFilter)}addFilter(e,t){return this.filterService.addFilter(e,t)}updateFilter(e,t){return this.filterService.updateFilter(e,t)}removeFilter(e){return this.filterService.removeFilter(e)}clearAllFilters(){this.filterService.clearFilters()}clearFilters(){this.filterService.clearFilters()}toggleFilter(e,t){return this.filterService.toggleFilter(e,t)}hasFilter(e){return this.filterService.hasFilter(e)}getActiveFilters(){return this.filterService.getActiveFilters()}getFilterCount(){return this.filterService.getFilterCount()}isEmpty(){return this.filterService.isEmpty()}addEventListener(e){this.filterService.addEventListener(e)}removeEventListener(e){this.filterService.removeEventListener(e)}saveFiltersToStorage(){const e=this.filterService.filterState.serialize();localStorage.setItem("wpi-schedule-filters",e)}loadFiltersFromStorage(){const e=localStorage.getItem("wpi-schedule-filters");return e?this.filterService.filterState.deserialize(e):!1}getFilterSummary(){return this.filterService.getFilterSummary()}filterPeriods(e){if(this.isEmpty())return this.getAllPeriodsWithContext(e);const t=this.getActiveFilters();let s=e;const r=t.find(n=>n.id==="courseSelection");r&&(s=this.courseSelectionFilter.applyToSelectedCourses(e,r.criteria));let i=this.getAllPeriodsWithContext(s);const o=t.find(n=>n.id==="searchText");o&&(i=this.applySearchTextToPeriods(i,o.criteria.query));for(const n of t)switch(n.id){case"periodDays":const c=new Set(n.criteria.days.map(d=>d.toLowerCase()));i=i.filter(d=>!Array.from(d.period.days).some(l=>c.has(l.toLowerCase())));break;case"periodProfessor":i=i.filter(d=>this.periodProfessorFilter.applyToPeriods([d.period],n.criteria).length>0);break;case"periodType":const a=new Set(n.criteria.types.map(d=>this.periodTypeFilter.normalizeType(d)));i=i.filter(d=>{const l=this.periodTypeFilter.normalizeType(d.period.type);return!a.has(l)});break;case"periodAvailability":i=i.filter(d=>this.periodAvailabilityFilter.applyToPeriods([d.period],n.criteria).length>0);break;case"periodConflict":if(this.periodConflictFilter){const d=this.periodsToSections(i),l=this.periodConflictFilter.applyToSectionsWithContext(d,{...n.criteria,selectedCourses:e});i=this.sectionsToPeriodsWithContext(l)}break}return i}getAllSectionsWithContext(e){const t=[];for(const s of e)for(const r of s.course.sections)t.push({course:s,section:r});return t}sectionsToPeriodsWithContext(e){const t=[];for(const s of e)for(const r of s.section.periods)t.push({course:s.course,period:r});return t}periodsToSections(e){const t=new Map;for(const s of e){const r=s.course.course.sections.find(i=>i.periods.includes(s.period));if(r){const i=`${s.course.course.id}-${r.number}`;t.has(i)||t.set(i,{course:s.course,section:r})}}return Array.from(t.values())}getAllPeriodsWithContext(e){const t=[];for(const s of e)for(const r of s.course.sections)for(const i of r.periods)t.push({course:s,period:i});return t}applySearchTextToPeriods(e,t){if(!t||!t.trim())return e;const s=t.toLowerCase().trim();return e.filter(r=>{const i=r.course.course,o=r.period;return!!(i.name.toLowerCase().includes(s)||i.number.toLowerCase().includes(s)||i.department.abbreviation.toLowerCase().includes(s)||o.professor.toLowerCase().includes(s)||o.type.toLowerCase().includes(s)||o.building.toLowerCase().includes(s)||o.room.toLowerCase().includes(s)||o.location.toLowerCase().includes(s))})}filterSections(e){if(this.isEmpty())return this.getAllSectionsWithContext(e);const t=this.getActiveFilters();let s=e;const r=t.find(c=>c.id==="courseSelection");r&&(s=this.courseSelectionFilter.applyToSelectedCourses(e,r.criteria));let i=this.getAllSectionsWithContext(s);const o=t.find(c=>c.id==="sectionCode");o&&(i=this.applySectionCodeFilter(i,o.criteria.codes));const n=t.find(c=>c.id==="searchText");n&&(i=this.applySearchTextToSections(i,n.criteria.query));for(const c of t)switch(c.id){case"periodDays":const a=new Set(c.criteria.days.map(l=>l.toLowerCase()));i=i.filter(l=>!l.section.periods.some(u=>Array.from(u.days).some(m=>a.has(m.toLowerCase()))));break;case"periodProfessor":i=i.filter(l=>this.periodProfessorFilter.applyToPeriods(l.section.periods,c.criteria).length>0);break;case"periodType":const d=new Set(c.criteria.types.map(l=>this.periodTypeFilter.normalizeType(l)));i=i.filter(l=>!l.section.periods.some(u=>{const m=this.periodTypeFilter.normalizeType(u.type);return d.has(m)}));break;case"periodTerm":i=this.periodTermFilter.applyToSections(i,c.criteria);break;case"periodAvailability":i=i.filter(l=>this.periodAvailabilityFilter.applyToPeriods(l.section.periods,c.criteria).length>0);break;case"periodConflict":this.periodConflictFilter&&(i=this.periodConflictFilter.applyToSectionsWithContext(i,{...c.criteria,selectedCourses:e}));break}return i}filterSelectedCourses(e){const t=this.filterPeriods(e),s=new Set(t.map(r=>r.course.course.id));return e.filter(r=>s.has(r.course.id))}getFilterOptions(e,t){switch(e){case"courseSelection":return t.map(s=>({value:s.course.id,label:`${s.course.department.abbreviation}${s.course.number} - ${s.course.name}`}));case"periodDays":return[{value:"mon",label:"Monday"},{value:"tue",label:"Tuesday"},{value:"wed",label:"Wednesday"},{value:"thu",label:"Thursday"},{value:"fri",label:"Friday"}];case"periodProfessor":return this.getAvailableProfessors(t);case"periodType":return this.getAvailablePeriodTypes(t);case"periodTerm":return this.getAvailableTerms(t);case"sectionCode":return this.getAvailableSectionCodes(t);default:return null}}applySectionCodeFilter(e,t){if(!t||t.length===0)return e;const s=t.map(r=>r.toLowerCase().trim()).filter(r=>r.length>0);return s.length===0?e:e.filter(r=>{const i=r.section.number.toLowerCase();return s.some(o=>i===o||i.includes(o)?!0:i.split("/").some(c=>c.trim()===o||c.trim().includes(o)))})}applySearchTextToSections(e,t){if(!t||!t.trim())return e;const s=t.toLowerCase().trim();return e.filter(r=>{const i=r.course.course,o=r.section;return i.name.toLowerCase().includes(s)||i.number.toLowerCase().includes(s)||i.department.abbreviation.toLowerCase().includes(s)||o.number.toLowerCase().includes(s)?!0:o.periods.some(n=>n.professor.toLowerCase().includes(s)||n.type.toLowerCase().includes(s)||n.building.toLowerCase().includes(s)||n.room.toLowerCase().includes(s)||n.location.toLowerCase().includes(s))})}getAvailableProfessors(e){const t=new Set;return e.forEach(r=>{r.course.sections.forEach(i=>{i.periods.forEach(o=>{o.professor&&o.professor.trim()&&t.add(o.professor.trim())})})}),Array.from(t).sort().map(r=>({value:r,label:r}))}getAvailablePeriodTypes(e){const t=new Set;return e.forEach(r=>{r.course.sections.forEach(i=>{i.periods.forEach(o=>{o.type&&o.type.trim()&&t.add(o.type.trim())})})}),Array.from(t).sort().map(r=>({value:r,label:this.formatPeriodType(r)}))}formatPeriodType(e){const t=e.toLowerCase();return t.includes("lec")||t.includes("lecture")?"Lecture":t.includes("lab")?"Lab":t.includes("dis")||t.includes("discussion")?"Discussion":t.includes("rec")||t.includes("recitation")?"Recitation":t.includes("sem")||t.includes("seminar")?"Seminar":t.includes("studio")?"Studio":t.includes("conference")||t.includes("conf")?"Conference":e.charAt(0).toUpperCase()+e.slice(1).toLowerCase()}getAvailableSectionCodes(e){const t=new Set;return e.forEach(r=>{r.course.sections.forEach(i=>{i.number&&i.number.trim()&&t.add(i.number.trim())})}),Array.from(t).sort().map(r=>({value:r,label:r}))}getAvailableTerms(e){console.log(`[DEBUG] getAvailableTerms called with ${e.length} courses`);const t=new Set;e.forEach(r=>{console.log(`[DEBUG] Processing course ${r.course.id} with ${r.course.sections.length} sections`),r.course.sections.forEach(i=>{console.log(`[DEBUG] Section ${i.number}: computedTerm = "${i.computedTerm}"`),i.computedTerm&&i.computedTerm.trim()&&i.computedTerm!=="undefined"&&typeof i.computedTerm=="string"?t.add(i.computedTerm.trim()):console.warn(`[WARN] Invalid computedTerm for section ${i.number}: "${i.computedTerm}"`)})});const s=Array.from(t).sort();return console.log("[DEBUG] Available terms found:",s),s.map(r=>({value:r,label:this.formatTermName(r)}))}formatTermName(e){const t=e.toUpperCase().trim();return{A:"A Term",B:"B Term",C:"C Term",D:"D Term"}[t]||e.toUpperCase()}}class rt{constructor(){this.courses=[],this.departments=[],this.searchIndex=new Map,this.professorCache=null,this.buildingCache=null,this.timeSlotMappings=new Map}setCourseData(e){this.departments=e,this.courses=[];for(const t of e)this.courses.push(...t.courses);this.clearCaches(),this.buildSearchIndex(),this.buildTimeSlotMappings()}searchCourses(e,t){let s=this.courses;return e.trim()&&(s=this.performTextSearch(s,e.trim())),t&&(s=this.applyFilters(s,t)),this.rankResults(s,e)}performTextSearch(e,t){const s=t.toLowerCase(),r=this.searchFromIndex(s);return r.length>0?e.filter(i=>r.includes(i)):e.filter(i=>{const o=[i.id,i.name,i.description,i.department.abbreviation,i.department.name,i.number].join(" ").toLowerCase();return this.fuzzyMatch(o,s)})}applyFilters(e,t){return e.filter(s=>{if(t.departments.length>0&&!t.departments.includes(s.department.abbreviation.toLowerCase()))return!1;if(t.creditRange){const{min:r,max:i}=t.creditRange;if(s.maxCredits<r||s.minCredits>i)return!1}return!(t.availabilityOnly&&!s.sections.some(i=>i.seatsAvailable>0)||t.timeSlots.length>0&&!s.sections.some(i=>i.periods.some(o=>t.timeSlots.some(n=>this.periodsOverlap(o,n))))||t.professors.length>0&&!s.sections.some(i=>i.periods.some(o=>t.professors.some(n=>o.professor.toLowerCase().includes(n.toLowerCase())))))})}periodsOverlap(e,t){const s=e.startTime.hours*60+e.startTime.minutes,r=e.endTime.hours*60+e.endTime.minutes,i=t.startTime.hours*60+t.startTime.minutes,o=t.endTime.hours*60+t.endTime.minutes,n=s<o&&i<r,c=t.days.some(a=>e.days.has(a));return n&&c}rankResults(e,t){if(!t.trim())return e;const s=t.toLowerCase();return e.sort((r,i)=>{const o=this.calculateRelevanceScore(r,s);return this.calculateRelevanceScore(i,s)-o})}calculateRelevanceScore(e,t){let s=0;e.id.toLowerCase()===t&&(s+=100),e.name.toLowerCase()===t&&(s+=90),e.id.toLowerCase().startsWith(t)&&(s+=80),e.name.toLowerCase().startsWith(t)&&(s+=70),e.department.abbreviation.toLowerCase().startsWith(t)&&(s+=60),e.id.toLowerCase().includes(t)&&(s+=40),e.name.toLowerCase().includes(t)&&(s+=30),e.description.toLowerCase().includes(t)&&(s+=10);const r=e.sections.reduce((o,n)=>o+n.seats,0);return e.sections.reduce((o,n)=>o+n.seatsAvailable,0)>0&&(s+=5),r>100&&(s+=2),s}getDepartments(){return this.departments}getCoursesByDepartment(e){const t=this.departments.find(s=>s.abbreviation.toLowerCase()===e.toLowerCase());return t?t.courses:[]}getAvailableProfessors(){if(this.professorCache)return this.professorCache;const e=new Set;return this.courses.forEach(t=>{t.sections.forEach(s=>{s.periods.forEach(r=>{r.professor&&r.professor!=="TBA"&&e.add(r.professor)})})}),this.professorCache=Array.from(e).sort(),this.professorCache}getAvailableBuildings(){if(this.buildingCache)return this.buildingCache;const e=new Set;return this.courses.forEach(t=>{t.sections.forEach(s=>{s.periods.forEach(r=>{r.building&&e.add(r.building)})})}),this.buildingCache=Array.from(e).sort(),this.buildingCache}clearCaches(){this.professorCache=null,this.buildingCache=null,this.searchIndex.clear(),this.timeSlotMappings.clear()}buildSearchIndex(){this.courses.forEach(e=>{this.extractKeywords(e).forEach(s=>{this.searchIndex.has(s)||this.searchIndex.set(s,new Set),this.searchIndex.get(s).add(e)})})}extractKeywords(e){const t=[e.id.toLowerCase(),e.name.toLowerCase(),e.number.toLowerCase(),e.department.abbreviation.toLowerCase(),e.department.name.toLowerCase(),...e.description.toLowerCase().split(/\s+/)];return t.forEach(s=>{if(s.length>3)for(let r=0;r<s.length-2;r++)t.push(s.substring(r,r+3))}),t.filter(s=>s.length>1)}searchFromIndex(e){const t=new Set;this.searchIndex.has(e)&&this.searchIndex.get(e).forEach(s=>t.add(s));for(const[s,r]of this.searchIndex.entries())(s.includes(e)||e.includes(s))&&r.forEach(i=>t.add(i));return Array.from(t)}fuzzyMatch(e,t){return e.includes(t)?!0:t.length<=3?e.includes(t):t.split(/\s+/).every(r=>{if(r.length<=2)return e.includes(r);const i=r.substring(0,Math.floor(r.length*.8));return e.includes(i)})}buildTimeSlotMappings(){this.courses.forEach(e=>{e.sections.forEach(t=>{t.periods.forEach(s=>{const r=this.getTimeSlotKey(s);this.timeSlotMappings.has(r)||this.timeSlotMappings.set(r,[]),this.timeSlotMappings.get(r).includes(e)||this.timeSlotMappings.get(r).push(e)})})})}getTimeSlotKey(e){const t=e.startTime.hours*60+e.startTime.minutes,s=e.endTime.hours*60+e.endTime.minutes;return`${Array.from(e.days).sort().join("")}-${t}-${s}`}getCreditRanges(){return[{min:1,max:1,label:"1 Credit"},{min:2,max:2,label:"2 Credits"},{min:3,max:3,label:"3 Credits"},{min:4,max:4,label:"4 Credits"},{min:1,max:2,label:"1-2 Credits"},{min:3,max:4,label:"3-4 Credits"},{min:1,max:4,label:"Any Credits"}]}}class it{constructor(){this.currentView="list",this.currentPage="planner"}setView(e){this.currentView=e;const t=document.getElementById("view-list"),s=document.getElementById("view-grid");t&&s&&(e==="list"?(t.classList.add("btn-primary","active"),t.classList.remove("btn-secondary"),s.classList.add("btn-secondary"),s.classList.remove("btn-primary","active")):(s.classList.add("btn-primary","active"),s.classList.remove("btn-secondary"),t.classList.add("btn-secondary"),t.classList.remove("btn-primary","active")))}togglePage(){const e=this.currentPage==="planner"?"schedule":"planner";this.switchToPage(e)}switchToPage(e){if(e===this.currentPage)return;this.currentPage=e;const t=document.getElementById("schedule-btn");t&&(e==="schedule"?(t.textContent="Back to Classes",this.showSchedulePage()):(t.textContent="Schedule",this.showPlannerPage()))}showPlannerPage(){const e=document.getElementById("planner-page"),t=document.getElementById("schedule-page");e&&(e.style.display="grid"),t&&(t.style.display="none")}showSchedulePage(){const e=document.getElementById("planner-page"),t=document.getElementById("schedule-page");e&&(e.style.display="none"),t&&(t.style.display="flex")}showLoadingState(){const e=document.getElementById("department-list");e&&(e.innerHTML='<div class="loading-message">Loading departments...</div>')}showErrorMessage(e){const t=document.getElementById("department-list");t&&(t.innerHTML=`<div class="error-message">${e}</div>`);const s=document.getElementById("course-container");s&&(s.innerHTML=`<div class="error-message">${e}</div>`)}syncHeaderHeights(){const e=document.querySelector(".sidebar-header"),t=document.querySelector(".content-header"),s=document.querySelectorAll(".panel-header");!e||!t||!s.length||(document.documentElement.style.setProperty("--synced-header-height","auto"),requestAnimationFrame(()=>{const r=e.offsetHeight,i=t.offsetHeight,o=Array.from(s).map(c=>c.offsetHeight),n=Math.max(r,i,...o);document.documentElement.style.setProperty("--synced-header-height",`${n}px`)}))}setupHeaderResizeObserver(){if(!window.ResizeObserver)return;const e=[document.querySelector(".sidebar-header"),document.querySelector(".content-header"),...document.querySelectorAll(".panel-header")].filter(Boolean);if(!e.length)return;const t=new ResizeObserver(()=>{this.syncHeaderHeights()});e.forEach(s=>{t.observe(s)})}}class ot{constructor(){}updateClientTimestamp(){const e=document.getElementById("client-timestamp");if(e){const t=new Date,s={month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",second:"2-digit",hour12:!0},r=t.toLocaleDateString("en-US",s).replace(","," at");e.textContent=`Client loaded: ${r}`}}async loadServerTimestamp(){const e=document.getElementById("server-timestamp");if(e)try{const t=await fetch("./last-updated.json",{cache:"no-cache"});if(t.ok){const s=await t.json(),r=new Date(s.timestamp),i={month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",second:"2-digit",hour12:!0},o=r.toLocaleDateString("en-US",i).replace(","," at");e.textContent=`Server updated: ${o}`}else throw new Error(`Failed to fetch server timestamp: ${t.status}`)}catch(t){console.warn("Failed to load server timestamp:",t),e.textContent="Server timestamp unavailable"}}}class nt{constructor(e,t){this.filterModalController=null,this.listeners=[],this.isUpdating=!1,this.filterService=e,this.departmentController=t,this.filterService.addEventListener(()=>{this.isUpdating||(this.syncFilterToSidebar(),this.syncFilterToModal(),this.notifyListeners())})}setFilterModalController(e){this.filterModalController=e}addEventListener(e){this.listeners.push(e)}removeEventListener(e){const t=this.listeners.indexOf(e);t>-1&&this.listeners.splice(t,1)}notifyListeners(){const e=this.getActiveDepartments();this.listeners.forEach(t=>t(e))}syncSidebarToFilter(e,t=!1){this.isUpdating=!0;try{const s=this.getActiveDepartments();let r;t?s.includes(e)?r=s.filter(i=>i!==e):r=[...s,e]:s.length===1&&s[0]===e?r=[]:r=[e],r.length>0?this.filterService.addFilter("department",{departments:r}):this.filterService.removeFilter("department"),this.departmentController.clearDepartmentSelection(),this.updateSidebarVisualState(r),this.syncFilterToModal()}finally{this.isUpdating=!1}}syncFilterToSidebar(){if(this.isUpdating)return;const e=this.getActiveDepartments();this.updateSidebarVisualState(e),this.departmentController.clearDepartmentSelection()}syncFilterToModal(){!this.filterModalController||this.isUpdating||(this.filterModalController.refreshDepartmentSelection(),setTimeout(()=>{const e=this.getActiveDepartments();this.updateSidebarVisualState(e)},50))}getActiveDepartments(){return this.filterService.getActiveFilters().find(s=>s.id==="department")?.criteria?.departments||[]}clearAllDepartmentSelections(){this.isUpdating=!0;try{this.filterService.removeFilter("department"),this.departmentController.clearDepartmentSelection(),this.updateSidebarVisualState([]),this.syncFilterToModal()}finally{this.isUpdating=!1}}isDepartmentSelected(e){return this.getActiveDepartments().includes(e)}getSelectedDepartmentCount(){return this.getActiveDepartments().length}toggleDepartment(e){this.getActiveDepartments().includes(e)?this.syncSidebarToFilter(e,!0):this.syncSidebarToFilter(e,!0)}selectDepartments(e){this.isUpdating=!0;try{e.length>0?this.filterService.addFilter("department",{departments:e}):this.filterService.removeFilter("department"),this.updateSidebarVisualState(e),this.syncFilterToModal()}finally{this.isUpdating=!1}}updateSidebarVisualState(e){console.log("🔄 Updating sidebar visual state for departments:",e);const t=document.querySelectorAll(".department-item");console.log(`📊 Found ${t.length} department items in DOM`),t.forEach((r,i)=>{const o=r.getAttribute("data-dept-id");r.classList.contains("active")&&console.log(`🔄 Removing active class from ${o||`item-${i}`}`),r.classList.remove("active")});let s=0;e.forEach(r=>{const i=this.normalizeDepartmentId(r),o=this.findDepartmentElement(i);o?(o.classList.add("active"),s++,console.log(`✅ Applied active styling to ${r} (normalized: ${i})`)):(console.warn(`❌ Could not find department element for ${r} (normalized: ${i})`),this.debugDepartmentElementSearch(r))}),console.log(`📈 Successfully applied active styling to ${s}/${e.length} departments`),this.updateMultiSelectionIndicators(e)}normalizeDepartmentId(e){return e.trim().toUpperCase()}findDepartmentElement(e){const t=this.normalizeDepartmentId(e);let s=document.querySelector(`[data-dept-id="${e}"]`);if(s||(s=document.querySelector(`[data-dept-id="${t}"]`),s)||(s=document.querySelector(`[data-dept-id="${t.toLowerCase()}"]`),s))return s;const r=document.querySelectorAll(".department-item");for(const i of r){const o=i.getAttribute("data-dept-id");if(o&&o.toUpperCase()===t)return i}return null}debugDepartmentElementSearch(e){const t=document.querySelectorAll(".department-item");console.log(`🔍 Debug search for ${e}:`),console.log("   Available department items:"),t.forEach((r,i)=>{const o=r.getAttribute("data-dept-id"),n=r.textContent?.trim()||"No text";console.log(`   ${i+1}. data-dept-id="${o}" text="${n}"`)}),document.getElementById("department-list")?console.log("✅ Department list container exists"):console.error("❌ Department list container (#department-list) not found in DOM!")}updateMultiSelectionIndicators(e){const t=document.querySelector(".sidebar-header h2");t&&(e.length===0?t.textContent="Departments":e.length===1?t.textContent="Departments (1 selected)":t.textContent=`Departments (${e.length} selected)`);const s=document.getElementById("department-list");s&&(e.length>1?s.classList.add("multi-select-active"):s.classList.remove("multi-select-active"))}initialize(){this.syncFilterToSidebar();const e=this.getActiveDepartments();e.length>0&&this.updateSidebarVisualState(e)}getSelectionDescription(){const e=this.getActiveDepartments();return e.length===0?"No departments selected":e.length===1?`${e[0]} selected`:e.length<=3?`${e.join(", ")} selected`:`${e.length} departments selected`}forceVisualRefresh(){console.log("🔄 Forcing complete visual refresh of department states");const e=this.getActiveDepartments();this.updateSidebarVisualState(e)}debugVisualSync(){const e=this.getActiveDepartments(),t=[];document.querySelectorAll(".department-item.active").forEach(i=>{const o=i.getAttribute("data-dept-id");o&&t.push(o)}),console.log("🔍 Department Sync Debug:"),console.log("  Filter state departments:",e),console.log("  Visually active departments:",t);const s=e.filter(i=>!t.includes(i)),r=t.filter(i=>!e.includes(i));s.length>0&&console.warn("  ❌ Departments missing visual active state:",s),r.length>0&&console.warn("  ❌ Departments with incorrect visual active state:",r),s.length===0&&r.length===0&&console.log("  ✅ Visual state perfectly synced with filter state")}enableDebugMode(){console.log("🐛 Enabling department selection debug mode"),this.getActiveDepartments().forEach(t=>{const s=this.findDepartmentElement(t);s&&s.classList.add("debug-selected")}),setTimeout(()=>{this.disableDebugMode()},1e4)}disableDebugMode(){console.log("🐛 Disabling department selection debug mode"),document.querySelectorAll(".department-item.debug-selected").forEach(e=>{e.classList.remove("debug-selected")})}}class ct{constructor(e,t){this.activeScheduleId=null,this.listeners=[],this.isLoadingSchedule=!1,this.hasUnsavedChanges=!1,this.saveStateListeners=[],this.storageManager=e||new I,this.courseSelectionService=t||new H,this.loadActiveScheduleId()}createNewSchedule(e){const t={id:this.generateScheduleId(),name:e,selectedCourses:[],generatedSchedules:[]};return this.storageManager.saveSchedule(t),t}createScheduleFromCurrent(e){const t=this.courseSelectionService.getSelectedCourses(),s={id:this.generateScheduleId(),name:e,selectedCourses:[...t],generatedSchedules:[]};return this.storageManager.saveSchedule(s),s}saveCurrentAsSchedule(e){return this.createScheduleFromCurrent(e)}loadSchedule(e){return this.storageManager.loadSchedule(e)}saveSchedule(e){this.storageManager.saveSchedule(e),this.activeScheduleId===e.id&&this.notifyListeners(e)}deleteSchedule(e){if(this.getAllSchedules().length<=1)return!1;if(this.storageManager.deleteSchedule(e),this.activeScheduleId===e){const s=this.getAllSchedules();s.length>0?this.setActiveSchedule(s[0].id):(this.activeScheduleId=null,this.saveActiveScheduleId(),this.notifyListeners(null))}return!0}getAllSchedules(){return this.storageManager.loadAllSchedules()}setActiveSchedule(e){const t=this.loadSchedule(e);if(!t){console.warn("Schedule not found:",e);return}console.log(`Switching to schedule: ${t.name} (${e})`),console.log(`Schedule contains ${t.selectedCourses.length} selected courses`),this.isLoadingSchedule=!0,this.activeScheduleId=e,this.saveActiveScheduleId(),this.courseSelectionService.clearAllSelections(),t.selectedCourses.forEach(s=>{console.log(`Loading course: ${s.course.department.abbreviation}${s.course.number}`),this.courseSelectionService.selectCourse(s.course,s.isRequired),s.selectedSectionNumber&&(console.log(`  Setting section: ${s.selectedSectionNumber}`),this.courseSelectionService.setSelectedSection(s.course,s.selectedSectionNumber))}),this.isLoadingSchedule=!1,this.updateActiveScheduleFromCurrentSelections(),this.notifyListeners(t)}getActiveSchedule(){return this.activeScheduleId?this.loadSchedule(this.activeScheduleId):null}getActiveScheduleId(){return this.activeScheduleId}updateActiveScheduleFromCurrentSelections(){if(console.log("🔄 updateActiveScheduleFromCurrentSelections: Starting update"),!this.activeScheduleId){console.log("❌ updateActiveScheduleFromCurrentSelections: No active schedule ID");return}const e=this.getActiveSchedule();if(!e){console.log("❌ updateActiveScheduleFromCurrentSelections: No active schedule found");return}const t=this.courseSelectionService.getSelectedCourses();console.log(`📋 updateActiveScheduleFromCurrentSelections: Found ${t.length} selected courses`);const s={...e,selectedCourses:[...t]};console.log(`💾 updateActiveScheduleFromCurrentSelections: Saving schedule "${e.name}" with ${s.selectedCourses.length} courses`),this.saveSchedule(s)}manualSaveCurrentProfile(){try{return this.updateActiveScheduleFromCurrentSelections(),this.setUnsavedChanges(!1),!0}catch(e){return console.error("Failed to save profile:",e),!1}}hasUnsavedChangesStatus(){return this.hasUnsavedChanges}markAsUnsaved(){this.setUnsavedChanges(!0)}setUnsavedChanges(e){this.hasUnsavedChanges!==e&&(this.hasUnsavedChanges=e,this.notifySaveStateListeners(e))}onSaveStateChange(e){this.saveStateListeners.push(e)}offSaveStateChange(e){const t=this.saveStateListeners.indexOf(e);t>-1&&this.saveStateListeners.splice(t,1)}notifySaveStateListeners(e){this.saveStateListeners.forEach(t=>{try{t(e)}catch(s){console.error("Error in save state listener:",s)}})}renameSchedule(e,t){const s=this.loadSchedule(e);return s?(s.name=t,this.saveSchedule(s),!0):!1}duplicateSchedule(e,t){const s=this.loadSchedule(e);if(!s)return null;const r={id:this.generateScheduleId(),name:t,selectedCourses:[...s.selectedCourses],generatedSchedules:[...s.generatedSchedules]};return this.storageManager.saveSchedule(r),r}initializeDefaultScheduleIfNeeded(){const e=this.getAllSchedules();if(e.length===0){const t=this.courseSelectionService.getSelectedCourses(),s=this.createNewSchedule("My Schedule");t.length>0&&(s.selectedCourses=[...t],this.saveSchedule(s)),this.setActiveSchedule(s.id)}else this.activeScheduleId||this.setActiveSchedule(e[0].id);this.setupCourseSelectionListener()}setupCourseSelectionListener(){this.courseSelectionService.onSelectionChange(()=>{if(console.log("📞 ScheduleManagementService: Received course selection change event"),this.isLoadingSchedule){console.log("⏸️ ScheduleManagementService: Skipping unsaved mark - currently loading schedule");return}console.log("🔄 ScheduleManagementService: Marking changes as unsaved"),this.markAsUnsaved()})}debugState(){console.log("=== SCHEDULE MANAGEMENT DEBUG ==="),console.log("Active Schedule ID:",this.activeScheduleId),console.log("All Schedules:",this.getAllSchedules().map(e=>({id:e.id,name:e.name,courseCount:e.selectedCourses.length}))),console.log("Active Schedule:",this.getActiveSchedule()),console.log("Current Selected Courses:",this.courseSelectionService.getSelectedCourses().length),console.log("=================================")}onActiveScheduleChange(e){this.listeners.push(e)}offActiveScheduleChange(e){const t=this.listeners.indexOf(e);t>-1&&this.listeners.splice(t,1)}notifyListeners(e){this.listeners.forEach(t=>{try{t(e)}catch(s){console.error("Error in schedule change listener:",s)}})}generateScheduleId(){return`schedule_${Date.now()}_${Math.random().toString(36).substr(2,9)}`}saveActiveScheduleId(){this.storageManager.saveActiveScheduleId(this.activeScheduleId)}loadActiveScheduleId(){this.activeScheduleId=this.storageManager.loadActiveScheduleId()}exportSchedule(e){const t=this.loadSchedule(e);if(!t)return null;const s={version:"1.0",timestamp:new Date().toISOString(),schedule:t};return JSON.stringify(s,null,2)}importSchedule(e){try{const t=JSON.parse(e);if(!t.schedule)return null;const s={...t.schedule,id:this.generateScheduleId()};return this.storageManager.saveSchedule(s),s}catch(t){return console.error("Failed to import schedule:",t),null}}getCourseSelectionService(){return this.courseSelectionService}}class lt{constructor(){this.scheduleSelector=null,this.allDepartments=[],this.previousSelectedCoursesCount=0,this.previousSelectedCoursesMap=new Map,this.courseDataService=new B,this.themeSelector=new Ce,this.courseSelectionService=new H,this.conflictDetector=new Te,this.modalService=new Ae,this.departmentController=new xe,this.searchService=new rt,this.filterService=new U(this.searchService),this.scheduleFilterService=new st(this.searchService),this.scheduleManagementService=new ct(void 0,this.courseSelectionService),this.uiStateManager=new it,this.timestampManager=new ot,this.operationManager=new $e,this.debouncedSearch=new Ie(this.operationManager,"search",300),this.courseController=new Pe(this.courseSelectionService),this.scheduleController=new Re(this.courseSelectionService),this.sectionInfoModalController=new Be(this.modalService),this.infoModalController=new He(this.modalService),this.filterModalController=new Ne(this.modalService),this.scheduleFilterModalController=new qe(this.modalService),this.courseController.setFilterService(this.filterService),this.filterModalController.setFilterService(this.filterService),this.scheduleFilterModalController.setScheduleFilterService(this.scheduleFilterService),this.scheduleController.setConflictDetector(this.conflictDetector),this.scheduleController.setScheduleFilterService(this.scheduleFilterService),this.scheduleController.setScheduleFilterModalController(this.scheduleFilterModalController),this.scheduleController.setScheduleManagementService(this.scheduleManagementService),this.scheduleController.setSectionInfoModalController(this.sectionInfoModalController),this.departmentSyncService=new nt(this.filterService,this.departmentController),this.departmentController.setDepartmentSyncService(this.departmentSyncService),this.departmentSyncService.setFilterModalController(this.filterModalController),this.scheduleController.setStatePreserver({preserve:()=>this.preserveDropdownStates(),restore:t=>this.restoreDropdownStates(t)});const e=this.courseSelectionService.getSelectedCourses();this.previousSelectedCoursesCount=e.length,this.previousSelectedCoursesMap=new Map,e.forEach(t=>{this.previousSelectedCoursesMap.set(t.course.id,t.selectedSectionNumber)}),this.initializeFilters(),this.init()}initializeFilters(){tt().forEach(s=>{this.filterService.registerFilter(s)});const t=new z;this.filterService.registerFilter(t),this.filterService.addEventListener(s=>{this.refreshCurrentView()}),this.filterService.loadFiltersFromStorage(),setTimeout(()=>this.updateFilterButtonState(),100)}async init(){this.uiStateManager.showLoadingState(),await this.loadCourseData(),this.departmentController.displayDepartments(),this.setupEventListeners(),this.setupCourseSelectionListener(),this.setupSaveStateListener(),this.courseController.displaySelectedCourses(),this.uiStateManager.syncHeaderHeights(),this.uiStateManager.setupHeaderResizeObserver()}async loadCourseData(){try{const e=await this.courseDataService.loadCourseData();this.allDepartments=e.departments,this.departmentController.setAllDepartments(this.allDepartments),this.courseController.setAllDepartments(this.allDepartments),this.courseSelectionService.setAllDepartments(this.allDepartments),this.searchService.setCourseData(this.allDepartments),this.filterModalController.setCourseData(this.allDepartments),this.departmentSyncService.initialize(),this.courseSelectionService.reconstructSectionObjects(),this.scheduleManagementService.initializeDefaultScheduleIfNeeded(),this.timestampManager.updateClientTimestamp(),this.timestampManager.loadServerTimestamp(),typeof window<"u"&&(window.debugDepartmentSync={debug:()=>this.departmentSyncService.debugVisualSync(),refresh:()=>this.departmentSyncService.forceVisualRefresh(),enableDebug:()=>this.departmentSyncService.enableDebugMode(),disableDebug:()=>this.departmentSyncService.disableDebugMode(),getActive:()=>this.departmentSyncService.getActiveDepartments(),getDescription:()=>this.departmentSyncService.getSelectionDescription()},window.debugScheduleManagement={debug:()=>this.scheduleManagementService.debugState(),getService:()=>this.scheduleManagementService,createSchedule:t=>this.scheduleManagementService.createNewSchedule(t),switchSchedule:t=>this.scheduleManagementService.setActiveSchedule(t),getSchedules:()=>this.scheduleManagementService.getAllSchedules(),getCurrentPage:()=>this.uiStateManager.currentPage,createTestSchedules:()=>{const t=this.scheduleManagementService.createNewSchedule("Test Schedule 1"),s=this.scheduleManagementService.createNewSchedule("Test Schedule 2");return console.log("Created test schedules:",t.id,s.id),{schedule1:t,schedule2:s}},testCompleteSwitch:t=>{const s=this.scheduleManagementService.getAllSchedules();if(s.length<2&&!t){const{schedule1:i,schedule2:o}=window.debugScheduleManagement.createTestSchedules();t=i.id}const r=t||s[0].id;console.log("Testing complete schedule switch to:",r),this.scheduleManagementService.setActiveSchedule(r)}})}catch(e){console.error("Failed to load course data:",e),this.uiStateManager.showErrorMessage("Failed to load course data. Please try refreshing the page.")}}setupEventListeners(){document.addEventListener("click",d=>{const l=d.target;if(l.classList.contains("department-item")){const u=l.dataset.deptId;if(u){const m=d.ctrlKey||d.metaKey;this.departmentController.handleDepartmentClick(u,m)}}if(l.classList.contains("section-badge")&&l.classList.toggle("selected"),l.classList.contains("course-select-btn")){const u=l.closest(".course-item, .course-card");u&&this.courseController.toggleCourseSelection(u)}if(l.classList.contains("course-remove-btn")){const u=this.courseController.getCourseFromElement(l);u&&this.courseSelectionService.unselectCourse(u)}if(l.classList.contains("section-select-btn")){d.stopPropagation();const u=l.closest(".schedule-course-item"),m=l.dataset.section;if(u&&m){const f=this.scheduleController.getCourseFromElement(u);f&&this.scheduleController.handleSectionSelection(f,m)}return}if(l.classList.contains("section-option")||l.closest(".section-option")||l.classList.contains("section-info")||l.closest(".section-info")||l.classList.contains("section-number")||l.classList.contains("section-schedule")||l.classList.contains("section-professor")){d.stopPropagation(),d.preventDefault();return}if(l.classList.contains("dropdown-trigger")||l.closest(".dropdown-trigger")){const u=l.classList.contains("dropdown-trigger")?l:l.closest(".dropdown-trigger");u&&!l.classList.contains("course-remove-btn")&&!l.classList.contains("section-select-btn")&&!l.classList.contains("section-number")&&!l.classList.contains("section-schedule")&&!l.classList.contains("section-professor")&&!l.closest(".section-option")&&!l.closest(".section-info")&&!l.closest(".schedule-sections-container")&&this.toggleCourseDropdown(u)}if(l.closest(".course-item, .course-card")&&!l.classList.contains("course-select-btn")&&!l.classList.contains("section-badge")){const u=l.closest(".course-item, .course-card");u&&this.courseController.selectCourse(u)}});const e=document.getElementById("search-input");e&&e.addEventListener("input",()=>{const d=e.value.trim();this.debouncedSearch.execute(async l=>(l.throwIfCancelled(),d.length>0?this.filterService.addFilter("searchText",{query:d}):this.filterService.removeFilter("searchText"),l.throwIfCancelled(),this.syncModalSearchInput(d),Promise.resolve())).catch(l=>{l.name!=="CancellationError"&&console.error("Search error:",l)})});const t=document.getElementById("clear-selection");t&&t.addEventListener("click",()=>{this.clearSelection()});const s=document.getElementById("schedule-btn");s&&s.addEventListener("click",()=>{if(this.uiStateManager.togglePage(),this.uiStateManager.currentPage==="schedule"){if(!this.scheduleSelector)try{this.scheduleSelector=new Fe(this.scheduleManagementService,"schedule-selector-container")}catch(l){console.error("Failed to initialize schedule selector:",l)}const d=this.courseSelectionService.getSelectedCourses();console.log("=== SCHEDULE PAGE LOADED ==="),console.log(`Found ${d.length} selected courses with sections:`),d.forEach(l=>{const u=l.selectedSection!==null;console.log(`${l.course.department.abbreviation}${l.course.number}: section ${l.selectedSectionNumber} ${u?"✓":"✗"}`),u&&l.selectedSection&&(console.log(`  Term: ${l.selectedSection.term}, Periods: ${l.selectedSection.periods.length}`),console.log("  Full section object:",l.selectedSection),l.selectedSection.periods.forEach((m,f)=>{console.log(`    Period ${f+1}:`,{type:m.type,professor:m.professor,startTime:m.startTime,endTime:m.endTime,days:Array.from(m.days),location:m.location,building:m.building,room:m.room});const v=Math.floor((m.startTime.hours*60+m.startTime.minutes-7*60)/10),g=Math.floor((m.endTime.hours*60+m.endTime.minutes-7*60)/10),b=g-v;console.log(`      Time slots: ${v} to ${g} (span ${b} rows)`)}))}),console.log(`=== END SCHEDULE SECTION DATA ===
`),this.scheduleController.displayScheduleSelectedCourses(),this.scheduleController.renderScheduleGrids()}});const r=document.getElementById("view-list"),i=document.getElementById("view-grid");r&&r.addEventListener("click",()=>{this.uiStateManager.setView("list"),this.refreshCurrentView()}),i&&i.addEventListener("click",()=>{this.uiStateManager.setView("grid"),this.refreshCurrentView()});const o=document.getElementById("filter-btn");o&&o.addEventListener("click",()=>{this.filterModalController.show()});const n=document.getElementById("schedule-filter-btn");n&&n.addEventListener("click",()=>{const d=this.courseSelectionService.getSelectedCourses();this.scheduleFilterModalController.setSelectedCourses(d),this.scheduleFilterModalController.show()});const c=document.getElementById("schedule-search-input");c&&c.addEventListener("input",()=>{const d=c.value.trim();d.length>0?this.scheduleFilterService.addFilter("searchText",{query:d}):this.scheduleFilterService.removeFilter("searchText"),this.scheduleController.applyFiltersAndRefresh()});const a=document.getElementById("save-profile-btn");a&&a.addEventListener("click",()=>{this.handleSaveProfile()})}refreshCurrentView(){const e=this.departmentController.getSelectedDepartment(),t=!this.filterService.isEmpty(),s=this.operationManager.startOperation("render","New render requested");let r=[];if(t){const i=e?e.courses:this.getAllCourses();r=this.filterService.filterCourses(i),this.updateFilteredHeader(r.length,e)}else e?(r=e.courses,this.updateDepartmentHeader(e)):(r=[],this.updateDefaultHeader());this.displayCoursesWithCancellation(r,s),t&&this.filterService.saveFiltersToStorage(),this.updateFilterButtonState(),this.syncSearchInputFromFilters()}async displayCoursesWithCancellation(e,t){try{await this.courseController.displayCoursesWithCancellation(e,this.uiStateManager.currentView,t),this.operationManager.completeOperation("render")}catch(s){if(s.name==="CancellationError")return;console.error("Error displaying courses:",s),this.operationManager.completeOperation("render")}}updateFilterButtonState(){const e=document.getElementById("filter-btn");if(e&&this.filterService){const t=!this.filterService.isEmpty(),s=this.filterService.getFilterCount();t?(e.classList.add("active"),e.title=`${s} filter${s===1?"":"s"} active - Click to modify`):(e.classList.remove("active"),e.title="Filter courses")}}clearSelection(){document.querySelectorAll(".section-badge.selected").forEach(r=>{r.classList.remove("selected")});const e=document.getElementById("search-input");e&&(e.value="");const t=document.getElementById("course-container");t&&(t.innerHTML='<div class="loading-message">Select a department to view courses...</div>');const s=document.querySelector(".content-header h2");s&&(s.textContent="Course Listings"),this.departmentController.clearDepartmentSelection(),this.courseController.clearCourseSelection(),this.courseController.displaySelectedCourses()}setupCourseSelectionListener(){this.courseSelectionService.onSelectionChange(e=>{const t=e.length,s=t!==this.previousSelectedCoursesCount,r=new Map;if(e.forEach(i=>{r.set(i.course.id,i.selectedSectionNumber)}),this.courseController.refreshCourseSelectionUI(),this.courseController.displaySelectedCourses(),s)this.scheduleController.displayScheduleSelectedCourses();else{let i=!1;for(const[o,n]of r)if(this.previousSelectedCoursesMap.get(o)!==n){i=!0;const a=e.find(d=>d.course.id===o);a&&this.scheduleController.updateSectionButtonStates(a.course,n)}i&&this.uiStateManager.currentPage==="schedule"&&this.scheduleController.renderScheduleGrids()}this.previousSelectedCoursesCount=t,this.previousSelectedCoursesMap=new Map(r)})}getSelectedCourses(){return this.courseSelectionService.getSelectedCourses()}getSelectedCoursesCount(){return this.courseSelectionService.getSelectedCoursesCount()}getCourseSelectionService(){return this.courseSelectionService}getFilterService(){return this.filterService}getModalService(){return this.modalService}getSectionInfoModalController(){return this.sectionInfoModalController}getInfoModalController(){return this.infoModalController}getScheduleManagementService(){return this.scheduleManagementService}toggleCourseDropdown(e){const t=e.closest(".schedule-course-item");if(!t)return;t.classList.contains("collapsed")?(t.classList.remove("collapsed"),t.classList.add("expanded")):(t.classList.remove("expanded"),t.classList.add("collapsed"))}preserveDropdownStates(){const e=new Map;return document.querySelectorAll(".schedule-course-item").forEach(t=>{const s=this.scheduleController.getCourseFromElement(t);if(s){const r=t.classList.contains("expanded");e.set(s.id,r)}}),e}restoreDropdownStates(e){document.querySelectorAll(".schedule-course-item").forEach(t=>{const s=this.scheduleController.getCourseFromElement(t);s&&e.has(s.id)&&(e.get(s.id)?(t.classList.remove("collapsed"),t.classList.add("expanded")):(t.classList.remove("expanded"),t.classList.add("collapsed")))})}getAllCourses(){const e=[];return this.allDepartments.forEach(t=>{e.push(...t.courses)}),e}syncModalSearchInput(e){this.filterModalController.syncSearchInputFromMain(e)}syncSearchInputFromFilters(){const e=document.getElementById("search-input");if(e){const s=this.filterService.getActiveFilters().find(r=>r.id==="searchText")?.criteria?.query||"";e.value!==s&&(e.value=s)}}updateFilteredHeader(e,t){const s=document.querySelector(".content-header h2");if(s){const r=this.filterService.getActiveFilters(),i=r.find(o=>o.id==="searchText");if(i&&r.length===1){const o=i.criteria.query;s.textContent=`Search: "${o}" (${e} results)`}else if(i){const o=i.criteria.query,n=r.length-1;s.textContent=`Search: "${o}" + ${n} filter${n===1?"":"s"} (${e} results)`}else{const o=r.length;s.textContent=`Filtered Results: ${o} filter${o===1?"":"s"} (${e} courses)`}}}updateDepartmentHeader(e){const t=document.querySelector(".content-header h2");t&&(t.textContent=`${e.name} (${e.abbreviation})`)}updateDefaultHeader(){const e=document.querySelector(".content-header h2");e&&(e.textContent="Course Listings")}handleSaveProfile(){const e=document.getElementById("save-profile-btn");if(!e)return;const t=e.innerHTML;e.innerHTML="⏳ Saving...",e.disabled=!0;const s=this.scheduleManagementService.manualSaveCurrentProfile();setTimeout(()=>{s?(e.innerHTML="✅ Saved!",setTimeout(()=>{e.innerHTML=t,e.disabled=!1},1500)):(e.innerHTML="❌ Error",setTimeout(()=>{e.innerHTML=t,e.disabled=!1},2e3))},300)}setupSaveStateListener(){this.scheduleManagementService.onSaveStateChange(e=>{this.updateSaveButtonState(e)})}updateSaveButtonState(e){const t=document.getElementById("save-profile-btn");t&&(e?(t.classList.add("unsaved-changes"),t.title="You have unsaved changes - Click to save",t.innerHTML.includes("*")||(t.innerHTML=t.innerHTML.replace("💾 Save","💾 Save*"))):(t.classList.remove("unsaved-changes"),t.title="Save current profile",t.innerHTML=t.innerHTML.replace("💾 Save*","💾 Save")))}}new lt;
//# sourceMappingURL=index-LyRvZVDY.js.map
