package jsonToXml;

import java.io.File;
import java.text.DateFormat;
import java.text.SimpleDateFormat;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;

import org.w3c.dom.Attr;
import org.w3c.dom.Document;
import org.w3c.dom.Element;

public class xmlOUT {
	
	public void exportXML(Schedb schedb) {
		try {
			DocumentBuilderFactory dbFactory = DocumentBuilderFactory.newInstance();
			DocumentBuilder dBuilder = dbFactory.newDocumentBuilder();
			Document doc = dBuilder.newDocument();
			
			Element rootElement = doc.createElement("schedb");
			rootElement.setAttribute("generated", schedb.getGenerated());
			rootElement.setAttribute("minutes-per-block", String.valueOf(schedb.getMinutesPerBlock()));
			doc.appendChild(rootElement);
			
			//long crnCounter = 0;
			
			for (dept department : schedb.getDepartments()) {
				Element dept = doc.createElement("dept");
				dept.setAttribute("abbrev", department.getAbbrev());
				dept.setAttribute("name", department.getName());
				
				for (course thisCourse : department.getCourses()) {
					Element course = doc.createElement("course");
					course.setAttribute("number", thisCourse.getNumber());
					course.setAttribute("name", thisCourse.getName());
					course.setAttribute("course_desc", thisCourse.getCourseDesc());
					course.setAttribute("min-credits", String.valueOf(thisCourse.getMinCredits()));
					course.setAttribute("max-credits", String.valueOf(thisCourse.getMaxCredits()));
					
					for (section thisSection : thisCourse.getSections()) {
						Element section = doc.createElement("section");
						//section.setAttribute("crn", String.format("%05d", crnCounter));
						//crnCounter++;
						section.setAttribute("crn", String.format("%018d", thisSection.getCrn()));
						section.setAttribute("number", thisSection.getNumber());
						section.setAttribute("seats", String.valueOf(thisSection.getSeats()));
						section.setAttribute("availableseats", String.valueOf(thisSection.getAvailableseats()));
						section.setAttribute("max_waitlist", String.valueOf(thisSection.getMaxWaitlist()));
						section.setAttribute("actual_waitlist", String.valueOf(thisSection.getActualWaitlist()));
						section.setAttribute("term", thisSection.getTerm());
						section.setAttribute("part-of-term", thisSection.getPartOfTerm());
						section.setAttribute("sec_desc", thisSection.getDescription());
						
						for (period thisPeriod : thisSection.getPeriods()) {
							Element period = doc.createElement("period");
							period.setAttribute("type", thisPeriod.getType());
							period.setAttribute("professor", thisPeriod.getProfessor());
							period.setAttribute("professor_sort_name", thisPeriod.getProfessorSortName());
							period.setAttribute("professor_email", thisPeriod.getProfessorEmail());
							
							String dayString = "";
							if(thisPeriod.isMonday()) {
								dayString = dayString + "mon,";
							}
							if(thisPeriod.isTuesday()) {
								dayString = dayString + "tue,";
							}
							if(thisPeriod.isWednesday()) {
								dayString = dayString + "wed,";
							}
							if(thisPeriod.isThursday()) {
								dayString = dayString + "thu,";
							}
							if(thisPeriod.isFriday()) {
								dayString = dayString + "fri,";
							}
							
							if(dayString.isEmpty()) {
								dayString = "?";
							}else {
								dayString = dayString.substring(0, dayString.length() - 1);  //remove the last comma
							}
							
							
							period.setAttribute("days", dayString);
							
							DateFormat dateFormat = new SimpleDateFormat("h:mmaa");
							
							period.setAttribute("starts", dateFormat.format(thisPeriod.getStarts()));
							period.setAttribute("ends", dateFormat.format(thisPeriod.getEnds()));
							
							period.setAttribute("building", thisPeriod.getBuilding());
							period.setAttribute("room", thisPeriod.getRoom());
							
							period.setAttribute("seats", String.valueOf(thisPeriod.getSeats()));
							period.setAttribute("availableseats", String.valueOf(thisPeriod.getAvailableseats()));
							period.setAttribute("max_waitlist", String.valueOf(thisPeriod.getMaxWaitlist()));
							period.setAttribute("actual_waitlist", String.valueOf(thisPeriod.getActualWaitlist()));
							
							period.setAttribute("section", String.valueOf(thisPeriod.getSpecificSection()));
							
							section.appendChild(period);
							
						}
						
						course.appendChild(section);
					}
					
					dept.appendChild(course);
				}
				
				rootElement.appendChild(dept);
			}
			
			
			TransformerFactory transformerFactory = TransformerFactory.newInstance();
			Transformer transformer = transformerFactory.newTransformer();
			//transformer.setOutputProperty(OutputKeys.INDENT, "yes");
			DOMSource source = new DOMSource(doc);
			StreamResult result = new StreamResult(new File("new.schedb"));
			transformer.transform(source, result);
			
			
		} catch (Exception e) {
			e.printStackTrace();
		}

	}

}
