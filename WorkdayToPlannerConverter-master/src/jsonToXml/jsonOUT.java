package jsonToXml;

import java.io.FileWriter;
import java.io.IOException;
import java.text.DateFormat;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.List;

import org.json.simple.JSONArray;
import org.json.simple.JSONObject;

public class jsonOUT {
	
	@SuppressWarnings("unchecked")
	public void exportJSON(Schedb schedb) {
		try {
			JSONObject root = new JSONObject();
			JSONArray departmentsArray = new JSONArray();
			
			// Add metadata
			root.put("generated", schedb.getGenerated());
			
			// Process each department
			for (dept department : schedb.getDepartments()) {
				JSONObject deptObj = new JSONObject();
				deptObj.put("abbreviation", department.getAbbrev());
				deptObj.put("name", department.getName());
				
				JSONArray coursesArray = new JSONArray();
				
				// Process each course in the department
				for (course thisCourse : department.getCourses()) {
					JSONObject courseObj = new JSONObject();
					courseObj.put("id", thisCourse.getNumber());
					courseObj.put("number", thisCourse.getNumber());
					courseObj.put("name", thisCourse.getName());
					courseObj.put("description", thisCourse.getCourseDesc());
					courseObj.put("min_credits", thisCourse.getMinCredits());
					courseObj.put("max_credits", thisCourse.getMaxCredits());
					
					JSONArray sectionsArray = new JSONArray();
					
					// Process each section in the course
					for (section thisSection : thisCourse.getSections()) {
						JSONObject sectionObj = new JSONObject();
						sectionObj.put("crn", thisSection.getCrn());
						sectionObj.put("number", thisSection.getNumber());
						sectionObj.put("seats", thisSection.getSeats());
						sectionObj.put("seats_available", thisSection.getAvailableseats());
						sectionObj.put("actual_waitlist", thisSection.getActualWaitlist());
						sectionObj.put("max_waitlist", thisSection.getMaxWaitlist());
						sectionObj.put("note", thisSection.getNote());
						sectionObj.put("description", thisSection.getDescription());
						sectionObj.put("term", thisSection.getTerm());
						sectionObj.put("computedTerm", thisSection.getComputedTerm()); // Include pre-computed term letter
						sectionObj.put("is_gps", false); // Add GPS flag if available in data model
						sectionObj.put("is_interest_list", false); // Add Interest List flag if available
						
						JSONArray periodsArray = new JSONArray();
						
						// Process each period in the section
						for (period thisPeriod : thisSection.getPeriods()) {
							JSONObject periodObj = new JSONObject();
							periodObj.put("type", thisPeriod.getType());
							periodObj.put("professor", thisPeriod.getProfessor());
							
							// Convert Java Date objects to HH:MM format
							DateFormat timeFormat = new SimpleDateFormat("HH:mm");
							periodObj.put("start_time", timeFormat.format(thisPeriod.getStarts()));
							periodObj.put("end_time", timeFormat.format(thisPeriod.getEnds()));
							
							periodObj.put("location", thisPeriod.getBuilding() + " " + thisPeriod.getRoom());
							periodObj.put("building", thisPeriod.getBuilding());
							periodObj.put("room", thisPeriod.getRoom());
							periodObj.put("seats", thisPeriod.getSeats());
							periodObj.put("seats_available", thisPeriod.getAvailableseats());
							periodObj.put("actual_waitlist", thisPeriod.getActualWaitlist());
							periodObj.put("max_waitlist", thisPeriod.getMaxWaitlist());
							periodObj.put("specific_section", thisPeriod.getSpecificSection());
							
							// Convert boolean days to array format
							JSONArray daysArray = new JSONArray();
							if(thisPeriod.isMonday()) daysArray.add("mon");
							if(thisPeriod.isTuesday()) daysArray.add("tue");
							if(thisPeriod.isWednesday()) daysArray.add("wed");
							if(thisPeriod.isThursday()) daysArray.add("thu");
							if(thisPeriod.isFriday()) daysArray.add("fri");
							
							periodObj.put("days", daysArray);
							
							periodsArray.add(periodObj);
						}
						
						sectionObj.put("periods", periodsArray);
						sectionsArray.add(sectionObj);
					}
					
					courseObj.put("sections", sectionsArray);
					coursesArray.add(courseObj);
				}
				
				deptObj.put("courses", coursesArray);
				departmentsArray.add(deptObj);
			}
			
			root.put("departments", departmentsArray);
			
			// Write JSON to file
			try (FileWriter file = new FileWriter("../public/course-data-constructed.json")) {
				file.write(root.toJSONString());
				file.flush();
			}
			
			System.out.println("JSON export completed: ../public/course-data-constructed.json");
			
		} catch (IOException e) {
			e.printStackTrace();
		}
	}
}