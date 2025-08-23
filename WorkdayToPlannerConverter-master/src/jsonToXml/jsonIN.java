package jsonToXml;

import java.io.BufferedReader;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileWriter;
import java.io.InputStreamReader;
import java.io.IOException;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.Properties;

import org.json.simple.JSONArray;
import org.json.simple.JSONObject;
import org.json.simple.parser.JSONParser;
import org.json.simple.parser.ParseException;

//Please edit "planner.properties" to modify configuration settings

public class jsonIN {
	
	InputStream inputStream;
	
	//Properties file attributes:
	String fallYear;
	String springYear;
	boolean showOldLink;
	String[] specialCourses;
	String[] specialSections;
	String[] sectionNumberAppendicies;
	
	public void readJSON(Schedb schedb) {
		JSONParser jsonParser = new JSONParser();
		
		try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream("../public/course-data.json"), "UTF-8"))){
			Object obj = jsonParser.parse(reader);
			
			JSONObject reportEntry = (JSONObject) obj;
			
			JSONArray courseList = (JSONArray) reportEntry.get("Report_Entry");
			
			readProperties(); // read properties from planner.properties
			processJSON(courseList, schedb);
			
		} catch (FileNotFoundException e) {
			e.printStackTrace();
		} catch (IOException e) {
			e.printStackTrace();
		} catch (ParseException e) {
			e.printStackTrace();
		}
		
	}
	
	public void readProperties() throws IOException{
		try {
			Properties prop = new Properties();
			String propFileName = "planner.properties";
			inputStream = new FileInputStream(propFileName);
			
			if (inputStream != null) {
				prop.load(inputStream);;
			}else {
				throw new FileNotFoundException("Property file '" + propFileName + "' not found.");
			}
			
			this.fallYear = prop.getProperty("FallYear");
			this.springYear = prop.getProperty("SpringYear");
			this.showOldLink = Boolean.parseBoolean(prop.getProperty("ShowOldLink"));
			this.specialCourses = prop.getProperty("SpecialCourses").split(",");
			this.specialSections = prop.getProperty("SpecialSections").split(",");
			this.sectionNumberAppendicies = prop.getProperty("SectionNumberAppendicies").split(",");
		} catch (Exception e) {
			System.out.println(e);
		} finally {
			inputStream.close();
		}
	}
	
	
	public boolean isValidAcademicPeriod(String period, String section, String type) throws IOException {	
		if((   //checking if the section is in a valid academic period and that it's not an interest list discussion or lab period. 
				!(period.equals(fallYear + " Fall A Term"))
				&& !(period.equals(fallYear + " Fall B Term"))
				&& !(period.equals(springYear + " Spring C Term"))
				&& !(period.equals(springYear + " Spring D Term"))
				&& !(period.equals(fallYear + " Fall Semester"))
				&& !(period.equals(springYear + " Spring Semester"))
				) || (section.contains("Interest List") && !(type.equals("Lecture")))) {
			return false;
		}else {
			return true;
		}
	}
	
	//checks if the given full section name is defined as "special" per planner.properties
	public boolean checkSpecialSection(String sectionNameFull) {
		return Arrays.stream(specialSections).anyMatch(sectionNameFull::contains);
	}
	
	//checks if the given course (subject and number) is defined as "special" per planner.properties
	public boolean checkSpecialCourse(String subject, String number) {
		String courseSubjectAndNumber = subject + " " + number;
		return Arrays.stream(specialCourses).anyMatch(courseSubjectAndNumber::contains);
	}
	
	public boolean checkSectionNumberAppendicies(String sectionNameFull) {
		return Arrays.stream(sectionNumberAppendicies).anyMatch(sectionNameFull::contains);
	}
	
	public void processJSON(JSONArray courseList, Schedb schedb) throws IOException {
		
		//Filter out all sections with the status "Canceled: Preliminary"
		for (int i = courseList.size() - 1; i >= 0; i--) {
			JSONObject currSection = (JSONObject) courseList.get(i);
			String sectionStatus = (String) currSection.get("Section_Status");
			if(sectionStatus.equals("Canceled: Preliminary")) {
				courseList.remove(i);
			}
		}
		
		boolean cont = true;
		boolean yearFound = false;
		int index = 0;
		while (cont) {
			JSONObject currSection;
			try {
				currSection = (JSONObject) courseList.get(index);
			}catch(Exception e) {
				cont = false;
				break;
			}
			
			JSONArray allSectionsThisCourseTerm = new JSONArray(); //array for all sections of a given course in a single term
			allSectionsThisCourseTerm.add(currSection);
			
			String currSectionCourseSection = (String) currSection.get("Course_Section");  //Course_Section from json
			String currSectionCourseSubjNum = currSectionCourseSection.substring(0, currSectionCourseSection.indexOf("-"));
			String currSectionAcademicPeriod = (String) currSection.get("Starting_Academic_Period_Type");
			String currSectionInstructionalFormat = (String) currSection.get("Instructional_Format");
			
			String currSectionAcademicPeriodWithYear = (String) currSection.get("Offering_Period");
			if(isValidAcademicPeriod(currSectionAcademicPeriodWithYear, currSectionCourseSection, currSectionInstructionalFormat) == false) {
				if (index >= courseList.size() - 1) {  //loop exit condition
					cont = false;
				} else {
					index = index + 1;
				}
				continue;
			}
			
			//on first VALID course section, read "Academic_Year" value from JSON and write it to yearHeader.txt
			if (yearFound == false) {
				String yearHeader = (String) currSection.get("Academic_Year");
				FileWriter writer = new FileWriter("yearHeader.txt", false);
				writer.write(yearHeader);
				writer.write("\n");
				if(showOldLink) {
					writer.write("true");
				} else {
					writer.write("false");
				}
				writer.close();
				yearFound = true;
			}
			
			int findOthersAddition = 1;  //place of next section we're checking
			if(index < courseList.size() - 1) {
				boolean findOthers = true;
				
				while(findOthers) {
					JSONObject nextSection;
					try{
						nextSection = (JSONObject) courseList.get(index+findOthersAddition);
					}catch (Exception e) {
						findOthers = false;
						break;
					}
					
					String nextSectionCourseSection = (String) nextSection.get("Course_Section");  //Course_Section from json
					String nextSectionCourseSubjNum = nextSectionCourseSection.substring(0, nextSectionCourseSection.indexOf("-"));
					String nextSectionAcademicPeriod = (String) nextSection.get("Starting_Academic_Period_Type");
					String nextSectionInstructionalFormat = (String) nextSection.get("Instructional_Format");
					
					String nextSectionAcademicPeriodWithYear = (String) nextSection.get("Offering_Period");
					if(isValidAcademicPeriod(nextSectionAcademicPeriodWithYear, nextSectionCourseSection, nextSectionInstructionalFormat) == false) {
						findOthersAddition++;
						continue;
					}
					
					if(nextSectionCourseSubjNum.equals(currSectionCourseSubjNum) && nextSectionAcademicPeriod.equals(currSectionAcademicPeriod)) {
						allSectionsThisCourseTerm.add(nextSection);
						findOthersAddition++;
					} else {
						findOthers = false;
					}
				}
			}
			
			//System.out.println(allSectionsThisCourseTerm);
			
			
			//at this point allSectionsThisCourseThisTerm is populated
			
			ArrayList<dept> departments = schedb.getDepartments();
			
			String currSecDept = currSectionCourseSection.substring(0, currSectionCourseSection.indexOf(" "));
			dept dummyDept = new dept(currSecDept);
			
			//try to find the department for this section
			
			int subjectIndexInDepartments = departments.indexOf(dummyDept);  //index of department of course in departments list
			
			dept department = null;
			
			try {
				department = departments.get(subjectIndexInDepartments);  //specific department object
			}catch(Exception e) {  //if this department doesn't exist in the department list, give it a new department of "Other"/"OT"
				dept dummyOther = new dept("OT");
				int indexOther = departments.indexOf(dummyOther);
				department = departments.get(indexOther);
			}
			
			
			//get details for course object
			String courseNum = currSectionCourseSubjNum.substring(currSectionCourseSubjNum.indexOf(" ") + 1, currSectionCourseSubjNum.length());
			
			String courseTitleFull = (String) currSection.get("Course_Title");
			String courseName = "";
			try {
				courseName = courseTitleFull.substring(courseTitleFull.indexOf("-") + 2, courseTitleFull.length());
			} catch (Exception e) {
				courseName = currSectionCourseSection.substring(currSectionCourseSection.indexOf("- ") + 2);
			}
			
			//if course is a special topics course, use Course_Description
			//else use Course_Section_Description
			//compensating for Workday's incompetency
			boolean isSTCourse = false;
			if(checkSpecialCourse(department.getAbbrev(), courseNum) == true) {
				isSTCourse = true;
			}
			if(checkSpecialSection(currSectionCourseSection) == true) {
				isSTCourse = true;
			}
			String courseDescRaw = "";
			if(isSTCourse == true) {
				courseDescRaw = (String) currSection.get("Course_Description");
			} else {
				courseDescRaw = (String) currSection.get("Course_Section_Description");
			} 
			
			String courseDesc;
			if(courseDescRaw != null) {
				courseDesc = courseDescRaw.replaceAll("\\<[^>]*>", " ");
				courseDesc = courseDesc.replace("&amp;", "&");
				courseDesc = courseDesc.replace("&#39;", "'");
				courseDesc = courseDesc.replace("&#43;", "+");
				courseDesc = courseDesc.replace("&#34;", "\"");
			}else {
				courseDesc = courseDescRaw;
			}
			double courseCredits =  Double.parseDouble((String)currSection.get("Credits"));
			
			course newCourse = new course(courseNum, courseName, courseDesc, courseCredits);
			if(department.getCourses().contains(newCourse)) {
				newCourse = department.getCourses().get(department.getCourses().indexOf(newCourse));
			}else {
				department.getCourses().add(newCourse);	
			}
			
			
			//section details
			
			//lists to gather like sections
			ArrayList<section> lectures = new ArrayList<section>();
			ArrayList<section> discussions = new ArrayList<section>();
			ArrayList<section> labs = new ArrayList<section>();
			
			for (int i = 0; i < allSectionsThisCourseTerm.size(); i++) { //for all course sections
				JSONObject thisSection = (JSONObject) allSectionsThisCourseTerm.get(i);
				
				//section number
				String thisCourseSectionFull = (String) thisSection.get("Course_Section");
				String thisSectionNum;
				
				boolean isGPSorST = false;  //course is GPS or Special Topics
				
				boolean isInterestList = false; //course section is an interest list section
				
				//COMMON PERIOD ATTRIBUTES
				
				//type
				String workdayType = (String) thisSection.get("Instructional_Format");
				String plannerType = "";
				if(workdayType.equals("Laboratory")) {
					plannerType = "Lab";
				}else {
					plannerType = workdayType;  //Lecture and Seminar are OK with Planner
				}
				//use plannerType
				
				//professor
				String thisProfessor = "";
				if(thisSection.get("Instructors") == null) {
					thisProfessor = "Not Assigned";
				} else if(thisSection.get("Instructors").equals("")) {
					thisProfessor = "Not Assigned";
				}
				else {
					thisProfessor = (String) thisSection.get("Instructors");
				}
				//use thisProfessor
				
				//part_of_term
				String term = (String) thisSection.get("Starting_Academic_Period_Type");
				String termActual;
				if(term.equals("Fall")) {
					termActual = "A Term, B Term";
				} else if(term.equals("Spring")){
					termActual = "C Term, D Term";
				}else {
					termActual = term;
				}
				
				//special section parsing rules for sections
				
				if(checkSectionNumberAppendicies(thisCourseSectionFull)) {
					thisSectionNum = thisCourseSectionFull.substring(thisCourseSectionFull.indexOf("-") + 1, thisCourseSectionFull.indexOf("-", thisCourseSectionFull.indexOf("-") + 6) - 1);
				
				//Checking to see if this course section is "special" as defined by planner.properties
				//If true, this will cause the full course section title to display with the section number
				
				}else if(checkSpecialSection(thisCourseSectionFull)) {
					thisSectionNum = thisCourseSectionFull.substring(thisCourseSectionFull.indexOf("-") + 1);
					isGPSorST = true;
				}else if(checkSpecialCourse(currSecDept, courseNum)) {
					thisSectionNum = thisCourseSectionFull.substring(thisCourseSectionFull.indexOf("-") + 1);
					isGPSorST = true;
					
				//Checking if this is an interest list section, setting appropriate section name
				} else if(thisCourseSectionFull.contains("Interest List")){
					thisSectionNum = "Interest List-" + term;
					thisProfessor = "N/A";
					isInterestList = true;
					
				}else {
					thisSectionNum = thisCourseSectionFull.substring(thisCourseSectionFull.indexOf("-") + 1, thisCourseSectionFull.indexOf("-", thisCourseSectionFull.indexOf("-") + 1) - 1);
				}
				
				if(thisSectionNum.contains("(")) {
					thisSectionNum = thisSectionNum.substring(0, thisSectionNum.indexOf("(") - 1);
				}
				
				//seats available and total seats
				String enrolledCapacityString = (String) thisSection.get("Enrolled_Capacity");
				int enrolled = Integer.parseInt(enrolledCapacityString.substring(0, enrolledCapacityString.indexOf("/")));
				int capacity = Integer.parseInt(enrolledCapacityString.substring(enrolledCapacityString.indexOf("/") + 1, enrolledCapacityString.length()));
				int availableSeats = capacity - enrolled;
				
				//waitlist capacity and actual
				String WaitlistCapacityString = (String) thisSection.get("Waitlist_Waitlist_Capacity");
				int waitlistActual = Integer.parseInt(WaitlistCapacityString.substring(0, WaitlistCapacityString.indexOf("/")));
				int waitlistTotal = Integer.parseInt(WaitlistCapacityString.substring(WaitlistCapacityString.indexOf("/") + 1, WaitlistCapacityString.length()));
				
				//establishing the course description for *this particular section*
				String secCourseDescRaw = (String) thisSection.get("Course_Section_Description"); 
				String secCourseDesc;
				if(secCourseDescRaw != null) {
					secCourseDesc = secCourseDescRaw.replaceAll("\\<[^>]*>", " ");
					secCourseDesc = secCourseDesc.replace("&amp;", "&");
					secCourseDesc = secCourseDesc.replace("&#39;", "'");
					secCourseDesc = secCourseDesc.replace("&#43;", "+");
					secCourseDesc = secCourseDesc.replace("&#34;", "\"");
				}else {
					secCourseDesc = secCourseDescRaw;
				}
				
				//CRN (Workday cour_sec_def_referenceID)
				String crnString = (String) thisSection.get("cour_sec_def_referenceID");
				long crn = Long.parseLong(crnString.substring(28, 34));
				
				//Section cluster (if exists)
				section newSection;
				if(isInterestList) {
					String clusterLetter = "IntList";
					newSection = new section(crn, thisSectionNum, capacity, availableSeats, waitlistTotal, waitlistActual, "202201", termActual, clusterLetter, secCourseDesc);
				}
				else if(thisSection.get("CF_LRV_Cluster_Ref_ID") == null) {
					newSection = new section(crn, thisSectionNum, capacity, availableSeats, waitlistTotal, waitlistActual, "202201", termActual, secCourseDesc);
				}
				else if(thisSection.get("CF_LRV_Cluster_Ref_ID").equals("")){
					newSection = new section(crn, thisSectionNum, capacity, availableSeats, waitlistTotal, waitlistActual, "202201", termActual, secCourseDesc);
				}else {
					String clusterID = (String) thisSection.get("CF_LRV_Cluster_Ref_ID");
					newSection = new section(crn, thisSectionNum, capacity, availableSeats, waitlistTotal, waitlistActual, "202201", termActual, clusterID, secCourseDesc);
				}
				
				//build new section object ^^^^
				
				//add GPS boolean
				//6/8/2021: Adjusting GPS boolean to include special topics courses and humanities capstone courses, since they require the same type of treatment
				if(isGPSorST) {
					newSection.setGPS(true);
				}else {
					newSection.setGPS(false);
				}
				
				//if interest list section, set section boolean to true
				if(isInterestList) {
					newSection.setInterestList(true);
				}else {
					newSection.setInterestList(false);
				}
				
				
				
				
				//need to build periods
				String allPeriodsString = (String) thisSection.get("Section_Details");
				if (allPeriodsString == null) {
					allPeriodsString = "Unknown|";  //for some reason at least one class has no section details??
				}else if(allPeriodsString.equals("")) {
					allPeriodsString = "Unknown|";
				}
				String[] allPeriods = allPeriodsString.split(";");
				for (String period : allPeriods) {
					String[] periodDetails = period.split("\\|");  //index 0: location, index 1: days of week, index 2: time
					
					if(periodDetails.length == 2) {    //if there's no location AT ALL in the schedule data for some reason =(
						String[] periodDetailsNew = new String[3];
						periodDetailsNew[2] = periodDetails[1];
						periodDetailsNew[1] = periodDetails[0];
						periodDetailsNew[0] = "Unknown";
						periodDetails = periodDetailsNew;
					}
					
					//location
					String thisLocation = periodDetails[0];
					
					boolean monday = false, tuesday = false, wednesday = false, thursday = false, friday = false;
					Date startTime = null;
					Date endTime = null;
					
					
					if(periodDetails.length > 1) {  //this section has a meeting pattern (days/times) ONLY, else values remain as above
						//days of week
						
						String days = periodDetails[1];
						if (days.contains("M")) {
							monday = true;
						}
						if(days.contains("T")) {
							tuesday = true;
						}
						if(days.contains("W")) {
							wednesday = true;
						}
						if(days.contains("R")) {
							thursday = true;
						}
						if(days.contains("F")) {
							friday = true;
						}
						
						String startTimeString = periodDetails[2].substring(1, periodDetails[2].indexOf("-") - 1);
						
						try {
							startTime = new SimpleDateFormat("hh:mm aa").parse(startTimeString);
						} catch (java.text.ParseException e) {
							// TODO Auto-generated catch block
							e.printStackTrace();
						}
						
						
						String endTimeString = periodDetails[2].substring(periodDetails[2].indexOf("-") + 2);
						try {
							endTime = new SimpleDateFormat("hh:mm aa").parse(endTimeString);
						} catch (java.text.ParseException e) {
							// TODO Auto-generated catch block
							e.printStackTrace();
						}
					}else {  //no meeting days/times
						try {
							startTime = new SimpleDateFormat("hh:mm aa").parse("12:00 PM");
						} catch (java.text.ParseException e) {
							// TODO Auto-generated catch block
							e.printStackTrace();
						}
						try {
							endTime = new SimpleDateFormat("hh:mm aa").parse("12:00 PM");
						} catch (java.text.ParseException e) {
							// TODO Auto-generated catch block
							e.printStackTrace();
						}
					}
					
					period newPeriod = new period(plannerType, thisProfessor, monday, tuesday, wednesday, thursday, friday, startTime, endTime, thisLocation, capacity, availableSeats, waitlistTotal, waitlistActual, thisSectionNum);
					newSection.getPeriods().add(newPeriod);
				}
				
				//INTERRUPT
				
				if(plannerType.equals("Lecture")) {
					lectures.add(newSection);
				}
				else if(plannerType.equals("Discussion")) {
					discussions.add(newSection);
				}
				else if(plannerType.equals("Lab")) {
					labs.add(newSection);
				}else {
					newCourse.getSections().add(newSection);
				}
				
			}
			
			//SECTION COMBINER STARTS HERE
			
			if(!lectures.isEmpty() && labs.isEmpty() && discussions.isEmpty()) {
				for (section lecture : lectures) {
					newCourse.getSections().add(lecture);
				}
			}
			else if(lectures.isEmpty() && !labs.isEmpty()) {   //if the class ONLY has labs (of which there are a few)
				for (section lab : labs) {
					newCourse.getSections().add(lab);
				}
			}else {
				//use lectures as our foundation, branch off from them
				for (section lecture : lectures) {
					if((lecture.isGPS() && lecture.getNote()==null) || lecture.isInterestList()) {  //if lecture is a GPS and not part of a cluster or is an interest list, isolate and don't combine with other sections
						newCourse.getSections().add(lecture);
					}else {
						if(!discussions.isEmpty()) {  //if there are discussions
							for (section discussion : discussions) {
								if(!labs.isEmpty()) {  //there are labs along with lectures and discussions
									for (section lab : labs) {
										ArrayList<section> sections = new ArrayList<section>();
										sections.add(lecture);
										sections.add(discussion);
										sections.add(lab);
										if(conflictChecker(sections)) {  //if sections are ok
											section combined = combiner(sections);
											newCourse.getSections().add(combined);
										}
									}
								}else {  //just lectures and discussions, no labs
									ArrayList<section> sections = new ArrayList<section>();
									sections.add(lecture);
									sections.add(discussion);
									if(conflictChecker(sections)) {  //if sections are ok
										section combined = combiner(sections);
										newCourse.getSections().add(combined);
									}
								}
							}
						} else {  //there are lectures and labs ONLY
							for (section lab : labs) {
								ArrayList<section> sections = new ArrayList<section>();
								sections.add(lecture);
								sections.add(lab);
								if(conflictChecker(sections)) {  //if sections are ok
									section combined = combiner(sections);
									newCourse.getSections().add(combined);
								}
							}
						}
					}
					
				}
			}
			
			
			if (index >= courseList.size() - 1) {  //loop exit condition
				cont = false;
			} else {
				index = index + findOthersAddition;
			}
		}
		
	}
	
	
	//method takes a list of sections and combines them into one section for planner to display as a group
	public section combiner(ArrayList<section> sections) {
		long crn = 0;
		String crnString = "";
		for (int i = 0; i < sections.size(); i++) {  //when combining sections, sum CRNs from all sections to get combined section
			crnString = crnString + Long.toString(sections.get(i).getCrn());
		}
		crn = Long.parseLong(crnString);
		
		String description = sections.get(0).getDescription();
		
		String number = "";
		for(int i = 0; i < sections.size() - 1; i++) {  //every section except the last one
			section section = sections.get(i);
			
			String secNumber = "";
			if(section.isGPS()) {   //if it is a GPS or special topics and NOT the last one being combined, remove the extra labeling
				secNumber = section.getNumber().substring(0, section.getNumber().indexOf("-") - 1);
			}else {
				secNumber = section.getNumber();
			}
			
			number = number + secNumber + "/";
		}
		
		number = number + sections.get(sections.size()-1).getNumber();   //get the last section number, FULL NAME
		
		int seats = 10000;
		for (section section: sections) {
			if(section.getSeats() < seats) {
				seats = section.getSeats();
			}
		}
		
		long availableSeats = 10000;
		for (section section: sections) {
			if(section.getAvailableseats() < availableSeats) {
				availableSeats = section.getAvailableseats();
			}
		}
		
		int maxWaitlist = 10000;
		for (section section: sections) {
			if(section.getMaxWaitlist() < maxWaitlist) {
				maxWaitlist = section.getMaxWaitlist();
			}
		}
		
		long actualWaitlist = 10000;
		for (section section: sections) {
			if(section.getActualWaitlist() < actualWaitlist) {
				actualWaitlist = section.getActualWaitlist();
			}
		}
		
		String term = sections.get(0).getTerm();
		String partOfTerm = sections.get(0).getPartOfTerm();
		
		section result = new section(crn, number, seats, availableSeats, maxWaitlist, actualWaitlist, term, partOfTerm, description);
		
		for (section section : sections) {
			ArrayList<period> thisSectionPeriods = section.getPeriods();
			for (period period : thisSectionPeriods) {
				result.getPeriods().add(period);
			}
		}
		
		
		return result;
	}
	
	//checks if the sections in the list are "compatible" with each other
	//sections are "compatible" if they a) adhere to cluster rules, if any exist AND b) don't time conflict with each other
	//returns TRUE if sections work well together, FALSE otherwise
	public boolean conflictChecker(ArrayList<section> sections) {
		
		//check if cluster requirements are met
		boolean goodCluster = true;
		String cluster = "";
		
		//check if course is GPS. If GPS course all combinations MUST be a part of a cluster
		boolean isGPS = sections.get(0).isGPS();
		
		if(isGPS) {  //all sections MUST be a part of the same cluster
			if(sections.get(0).getNote() != null) {   //if there is a cluster
				cluster = sections.get(0).getNote();
			}
			for(int i = 1; i < sections.size(); i++) {  //for the remaining sections
				String thisCluster;
				if(sections.get(i).getNote() != null) {
					thisCluster = sections.get(i).getNote();
				}else {
					thisCluster = "";
				}
				
				if(!(thisCluster.equals(cluster))) {  //if clusters don't match
					goodCluster = false;
				}
			}
		}else {    //it's ok to match with sections with no cluster assignment
			for (section section : sections) {
				if (section.getNote() != null) {   //if this section has a cluster
					if(cluster.isEmpty()) {
						cluster = section.getNote();
					}else {   //cluster assignment already exists, check
						if(!(cluster.equals(section.getNote()))) {  //if the clusters do not match
							goodCluster = false;
						}
					}
				}
			}
		}
		
		
		
		boolean goodTimes = true;
		
		if (sections.size() == 2) {
			period period1 = sections.get(0).getPeriods().get(0);
			period period2 = sections.get(1).getPeriods().get(0);
			goodTimes = periodConflictChecker(period1, period2);
		} else if(sections.size() == 3) {
			period period1 = sections.get(0).getPeriods().get(0);
			period period2 = sections.get(1).getPeriods().get(0);
			period period3 = sections.get(2).getPeriods().get(0);
			
			goodTimes = periodConflictChecker(period1, period2) && periodConflictChecker(period1, period3) && periodConflictChecker(period2, period3);
		}
		
		return goodCluster && goodTimes;
	}
	
	//checks if the given TWO PERIODS conflict with each other
	//returns FALSE if they don't work with each other, TRUE if the combination is ok
	public boolean periodConflictChecker(period period1, period period2) {
		boolean result = true;
		//assume true if they do overlap
		boolean timeOverlap = period2.getStarts().compareTo(period1.getEnds()) < 0 && period2.getEnds().compareTo(period1.getStarts()) > 0;
		
		if(timeOverlap) {
			if(period1.isMonday() && period2.isMonday()) {
				result = false;
			}
			if(period1.isTuesday() && period2.isTuesday()) {
				result = false;
			}
			if(period1.isWednesday() && period2.isWednesday()) {
				result = false;
			}
			if(period1.isThursday() && period2.isThursday()) {
				result = false;
			}
			if(period1.isFriday() && period2.isFriday()) {
				result = false;
			}
		} 
		
		return result;
	}

}
