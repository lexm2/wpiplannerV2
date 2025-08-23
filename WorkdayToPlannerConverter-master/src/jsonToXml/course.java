package jsonToXml;

import java.util.ArrayList;

public class course {
	private ArrayList<section> sections;
	private String number;
	private String name;
	private String courseDesc;
	private double minCredits;
	private double maxCredits;
	
	course(String number, String name, String courseDesc, double credits){
		sections = new ArrayList<section>();
		this.number = number;
		this.name = name;
		this.courseDesc = courseDesc;
		this.minCredits = credits;
		this.maxCredits = credits;
	}
	
	@Override
	public boolean equals(Object o) {
		course toCheck = (course) o;
		if(toCheck.getNumber().equals(this.number)) {
			return true;
		}else {
			return false;
		}
	}

	public ArrayList<section> getSections() {
		return sections;
	}

	public void setSections(ArrayList<section> sections) {
		this.sections = sections;
	}

	public String getNumber() {
		return number;
	}

	public void setNumber(String number) {
		this.number = number;
	}

	public String getName() {
		return name;
	}

	public void setName(String name) {
		this.name = name;
	}

	public String getCourseDesc() {
		return courseDesc;
	}

	public void setCourseDesc(String courseDesc) {
		this.courseDesc = courseDesc;
	}

	public double getMinCredits() {
		return minCredits;
	}

	public void setMinCredits(double minCredits) {
		this.minCredits = minCredits;
	}

	public double getMaxCredits() {
		return maxCredits;
	}

	public void setMaxCredits(double maxCredits) {
		this.maxCredits = maxCredits;
	}
}
