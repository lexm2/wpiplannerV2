package jsonToXml;

import java.util.ArrayList;

public class dept {
	private ArrayList<course> courses;
	private String abbrev;
	private String name;
	
	dept(String abbrev, String name){
		courses = new ArrayList<course>();
		this.abbrev = abbrev;
		this.name = name;
	}
	
	dept(String abbrev){  //dummy constructor for finding correct department in jsonIN
		this.abbrev = abbrev;
	}
	
	@Override
	public boolean equals(Object o) {
		dept toCheck = (dept) o;
		if(toCheck.getAbbrev().equals(this.abbrev)) {
			return true;
		}else {
			return false;
		}
	}

	public ArrayList<course> getCourses() {
		return courses;
	}

	public void setCourses(ArrayList<course> courses) {
		this.courses = courses;
	}

	public String getAbbrev() {
		return abbrev;
	}

	public void setAbbrev(String abbrev) {
		this.abbrev = abbrev;
	}

	public String getName() {
		return name;
	}

	public void setName(String name) {
		this.name = name;
	}
}
